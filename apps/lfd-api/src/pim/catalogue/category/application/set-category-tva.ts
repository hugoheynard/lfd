import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { requireRate } from "../../../commerce/application/tva-support.js";
import { TvaRateRepository } from "../../../commerce/domain/ports/tva-rate.repository.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import type { CategoryTvaIds } from "../domain/entities/category.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";
import { requireCategory } from "./category-support.js";

export class SetCategoryTvaCommand {
  constructor(
    readonly id: string,
    readonly ids: CategoryTvaIds,
  ) {}
}

/**
 * Règle les trois taux de TVA d'une famille en un geste. Chaque référence
 * non nulle est **validée** contre le contexte commerce (`requireRate`) : on
 * ne pointe jamais un taux fantôme, et l'agrégat ne peut pas le savoir seul.
 * `null` efface la référence.
 */
@CommandHandler(SetCategoryTvaCommand)
export class SetCategoryTvaHandler implements ICommandHandler<SetCategoryTvaCommand, void> {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly rates: TvaRateRepository,
    private readonly journal: PimJournal,
  ) {}

  async execute(command: SetCategoryTvaCommand): Promise<void> {
    const category = await requireCategory(this.categories, command.id);
    // Chaque référence non nulle est validée AVANT la première écriture : une
    // famille ne doit jamais se retrouver avec un taux réglé et un autre refusé.
    for (const rateId of [command.ids.emporter, command.ids.surPlace, command.ids.b2b]) {
      if (rateId !== null) {
        await requireRate(this.rates, rateId);
      }
    }
    const before = category.snapshot();
    category.setTva(command.ids);
    await this.categories.save(category);
    await this.journalize(before, category.snapshot());
  }

  /**
   * Le rattachement d'une famille à un taux — la décision qui détermine
   * réellement ce qui est taxé à quel taux. Silencieux quand rien n'a bougé :
   * un formulaire réenregistré à l'identique n'est pas un fait.
   */
  private async journalize(
    before: CategoryTvaSnapshot,
    after: CategoryTvaSnapshot & { id: string },
  ): Promise<void> {
    const changed =
      before.emporterTvaId !== after.emporterTvaId ||
      before.surPlaceTvaId !== after.surPlaceTvaId ||
      before.b2bTvaId !== after.b2bTvaId;
    if (!changed) {
      return;
    }
    await this.journal.record({
      type: PIM_EVENTS.categoryTvaChanged,
      subjectType: "category",
      subjectId: after.id,
      payload: {
        emporter: { from: before.emporterTvaId, to: after.emporterTvaId },
        surPlace: { from: before.surPlaceTvaId, to: after.surPlaceTvaId },
        b2b: { from: before.b2bTvaId, to: after.b2bTvaId },
      },
    });
  }
}

/** Le peu du snapshot que le journal compare. */
interface CategoryTvaSnapshot {
  readonly emporterTvaId: string | null;
  readonly surPlaceTvaId: string | null;
  readonly b2bTvaId: string | null;
}

import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { requireRate } from "../../../commerce/application/tva-support.js";
import { TvaRateRepository } from "../../../commerce/domain/ports/tva-rate.repository.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";
import { requireCategory } from "./category-support.js";

export class SetCategoryTvaCommand {
  constructor(
    readonly id: string,
    readonly emporterTvaId: string | null,
    readonly surPlaceTvaId: string | null,
  ) {}
}

/**
 * Règle les deux taux de TVA d'une famille en un geste. Chaque référence
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
    if (command.emporterTvaId !== null) {
      await requireRate(this.rates, command.emporterTvaId);
    }
    if (command.surPlaceTvaId !== null) {
      await requireRate(this.rates, command.surPlaceTvaId);
    }
    const before = category.snapshot();
    category.setTva(command.emporterTvaId, command.surPlaceTvaId);
    await this.categories.save(category);
    await this.journalize(before, category.snapshot());
  }

  /**
   * Le rattachement d'une famille à un taux — la décision qui détermine
   * réellement ce qui est taxé à quel taux. Silencieux quand rien n'a bougé :
   * un formulaire réenregistré à l'identique n'est pas un fait.
   */
  private async journalize(
    before: { emporterTvaId: string | null; surPlaceTvaId: string | null },
    after: {
      id: string;
      name: unknown;
      emporterTvaId: string | null;
      surPlaceTvaId: string | null;
    },
  ): Promise<void> {
    const changed =
      before.emporterTvaId !== after.emporterTvaId || before.surPlaceTvaId !== after.surPlaceTvaId;
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
      },
    });
  }
}

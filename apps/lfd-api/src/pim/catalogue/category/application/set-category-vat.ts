import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { requireRate } from "../../../commerce/application/vat-support.js";
import { VatRateRepository } from "../../../commerce/domain/ports/vat-rate.repository.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { SalesContextRegistry } from "../../shared/domain/ports/sales-context.registry.js";
import type { ContextVat } from "../../shared/domain/value-objects/sales-context.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";
import { requireCategory } from "./category-support.js";

export class SetCategoryVatCommand {
  constructor(
    readonly id: string,
    readonly vat: ContextVat,
  ) {}
}

/**
 * Règle les taux de TVA d'une famille en un geste, un par contexte de vente.
 *
 * Chaque référence est **validée** contre le contexte commerce (`requireRate`) :
 * on ne pointe jamais un taux fantôme, et l'agrégat ne peut pas le savoir seul.
 * Une clé absente efface le réglage de ce contexte.
 */
@CommandHandler(SetCategoryVatCommand)
export class SetCategoryVatHandler implements ICommandHandler<SetCategoryVatCommand, void> {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly rates: VatRateRepository,
    private readonly contexts: SalesContextRegistry,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetCategoryVatCommand): Promise<void> {
    const category = await requireCategory(this.categories, command.id);
    // Chaque référence est validée AVANT la première écriture : une famille ne
    // doit jamais se retrouver avec un taux réglé et un autre refusé.
    for (const rateId of Object.values(command.vat)) {
      await requireRate(this.rates, rateId);
    }
    const before = category.vatByContext;
    category.setVat(command.vat, await this.contexts.active());
    await this.uow.run(async () => {
      await this.categories.save(category);
      await this.journalize(category.id, before, category.vatByContext);
    });
  }

  /**
   * Le rattachement d'une famille à un taux — la décision qui détermine
   * réellement ce qui est taxé à quel taux. Silencieux quand rien n'a bougé :
   * un formulaire réenregistré à l'identique n'est pas un fait.
   *
   * Le journal note les contextes **touchés**, nommés par leur clé. Il notait
   * trois champs fixes : un quatrième contexte serait entré en base sans jamais
   * apparaître dans l'historique, et l'historique de la TVA est ce qu'on relit
   * quand un comptable demande depuis quand.
   */
  private async journalize(
    categoryId: string,
    before: ContextVat,
    after: ContextVat,
  ): Promise<void> {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    const changed = keys.filter((key) => before[key] !== after[key]);
    if (changed.length === 0) {
      return;
    }
    await this.journal.trace({
      type: PIM_EVENTS.categoryVatChanged,
      subjectType: "category",
      subjectId: categoryId,
      payload: Object.fromEntries(
        changed.map((key) => [key, { from: before[key] ?? null, to: after[key] ?? null }]),
      ),
    });
  }
}

import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { requireRate } from "../../../commerce/application/vat-support.js";
import { VatRateRepository } from "../../../commerce/domain/ports/vat-rate.repository.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { requireCategory } from "../../category/application/category-support.js";
import { CategoryRepository } from "../../category/domain/ports/category.repository.js";
import { SalesContextRegistry } from "../../shared/domain/ports/sales-context.registry.js";
import type { ContextVat } from "../../shared/domain/value-objects/sales-context.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "./product-support.js";

export class SetProductVatCommand {
  constructor(
    readonly id: string,
    readonly vat: ContextVat,
  ) {}
}

/**
 * Fait **déroger** un produit au taux de sa famille — ou le lui rend.
 *
 * Une carte vide n'est pas une dérogation vide : c'est le retour à l'héritage.
 * Le geste est donc réversible sans écrire un état « pas de dérogation », qui
 * ressemblerait à une décision et se compterait comme un usage.
 *
 * Trois vérifications, et aucune n'est à la portée de l'agrégat seul : le taux
 * existe (contexte commerce), le contexte existe (registre), la famille vend ce
 * contexte (elle est ailleurs). Le produit, lui, tient la dernière une fois
 * qu'on lui montre les canaux de sa famille.
 */
@CommandHandler(SetProductVatCommand)
export class SetProductVatHandler implements ICommandHandler<SetProductVatCommand, void> {
  constructor(
    private readonly products: ProductRepository,
    private readonly categories: CategoryRepository,
    private readonly rates: VatRateRepository,
    private readonly contexts: SalesContextRegistry,
    private readonly journal: PimJournal,
  ) {}

  async execute(command: SetProductVatCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    // Tout est validé AVANT la première écriture : un produit ne doit jamais se
    // retrouver avec un taux posé et un autre refusé.
    for (const rateId of Object.values(command.vat)) {
      await requireRate(this.rates, rateId);
    }
    const category = await requireCategory(this.categories, product.categoryId);

    const before = product.vatByContext;
    product.setVat(command.vat, await this.contexts.active(), category.channelPreset);
    await this.products.save(product);
    await this.journalize(product.id, before, product.vatByContext);
  }

  /**
   * Une dérogation de TVA est une décision qui se relit : c'est elle qu'on
   * cherche quand une facture surprend. Silencieux quand rien n'a bougé — un
   * formulaire réenregistré à l'identique n'est pas un fait.
   */
  private async journalize(
    productId: string,
    before: ContextVat,
    after: ContextVat,
  ): Promise<void> {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    const changed = keys.filter((key) => before[key] !== after[key]);
    if (changed.length === 0) {
      return;
    }
    await this.journal.record({
      type: PIM_EVENTS.productVatChanged,
      subjectType: "product",
      subjectId: productId,
      payload: Object.fromEntries(
        changed.map((key) => [key, { from: before[key] ?? null, to: after[key] ?? null }]),
      ),
    });
  }
}

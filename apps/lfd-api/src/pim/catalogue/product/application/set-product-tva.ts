import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { requireRate } from "../../../commerce/application/tva-support.js";
import { TvaRateRepository } from "../../../commerce/domain/ports/tva-rate.repository.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { requireCategory } from "../../category/application/category-support.js";
import { CategoryRepository } from "../../category/domain/ports/category.repository.js";
import { SalesContextRegistry } from "../../shared/domain/ports/sales-context.registry.js";
import type { ContextTva } from "../../shared/domain/value-objects/sales-context.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "./product-support.js";

export class SetProductTvaCommand {
  constructor(
    readonly id: string,
    readonly tva: ContextTva,
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
@CommandHandler(SetProductTvaCommand)
export class SetProductTvaHandler implements ICommandHandler<SetProductTvaCommand, void> {
  constructor(
    private readonly products: ProductRepository,
    private readonly categories: CategoryRepository,
    private readonly rates: TvaRateRepository,
    private readonly contexts: SalesContextRegistry,
    private readonly journal: PimJournal,
  ) {}

  async execute(command: SetProductTvaCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    // Tout est validé AVANT la première écriture : un produit ne doit jamais se
    // retrouver avec un taux posé et un autre refusé.
    for (const rateId of Object.values(command.tva)) {
      await requireRate(this.rates, rateId);
    }
    const category = await requireCategory(this.categories, product.categoryId);

    const before = product.tvaByContext;
    product.setTva(command.tva, await this.contexts.active(), category.channelPreset);
    await this.products.save(product);
    await this.journalize(product.id, before, product.tvaByContext);
  }

  /**
   * Une dérogation de TVA est une décision qui se relit : c'est elle qu'on
   * cherche quand une facture surprend. Silencieux quand rien n'a bougé — un
   * formulaire réenregistré à l'identique n'est pas un fait.
   */
  private async journalize(
    productId: string,
    before: ContextTva,
    after: ContextTva,
  ): Promise<void> {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    const changed = keys.filter((key) => before[key] !== after[key]);
    if (changed.length === 0) {
      return;
    }
    await this.journal.record({
      type: PIM_EVENTS.productTvaChanged,
      subjectType: "product",
      subjectId: productId,
      payload: Object.fromEntries(
        changed.map((key) => [key, { from: before[key] ?? null, to: after[key] ?? null }]),
      ),
    });
  }
}

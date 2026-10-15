import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { requireCategory } from "../../category/application/category-support.js";
import { CategoryRepository } from "../../category/domain/ports/category.repository.js";
import { CatalogueReader } from "../../shared/domain/ports/catalogue-reader.js";
import { effectiveAudience } from "../../shared/domain/value-objects/audience.js";
import type { Product } from "../domain/entities/product.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "./product-support.js";
import { CatalogEmitter } from "../../shared/domain/ports/catalog-emitter.js";

export class ActivateProductCommand {
  constructor(readonly id: string) {}
}

/**
 * Met le produit en vente — l'ancien « publier » (1e du plan
 * `plan-catalogue-synchronise-par-audience.md`). La route `/publish` et la
 * valeur de journal `product.published` restent : le front n'est touché qu'au
 * lot 3, et une valeur de journal ne se renomme pas.
 *
 * Le refus appartient à l'agrégat — allergènes par déclinaison, prix, taux.
 * Le handler ne fait que lui montrer ce qu'il ne voit pas : le taux effectif
 * résolu comme la projection le résout (`CatalogueReader.vatPercents`, la
 * même lecture que `feed-projection.service.ts`), et l'audience effective,
 * qui dépend de la famille.
 *
 * ⚠️ Les valeurs nutritionnelles n'entrent pas dans ce refus : le règlement
 * (UE) n° 1169/2011 les exempte dans les deux cas de vente de La Folie Coffee
 * (`plan-separer-allergenes-et-nutrition.md`, D2).
 */
@CommandHandler(ActivateProductCommand)
export class ActivateProductHandler implements ICommandHandler<ActivateProductCommand, void> {
  constructor(
    private readonly products: ProductRepository,
    private readonly categories: CategoryRepository,
    private readonly catalogue: CatalogueReader,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly emitter: CatalogEmitter,
  ) {}

  async execute(command: ActivateProductCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    // Déjà en vente : `activate()` rend `false` et rien ne bouge. Journaliser
    // quand même daterait une mise en vente au jour du second clic.
    if (!(await this.activate(product))) {
      return;
    }
    const { sku, name, variants } = product.snapshot();
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.productPublished,
        subjectType: "product",
        subjectId: command.id,
        payload: { subjectLabel: name.fr, sku, name },
        // La portée d'une mise en vente : les articles qui partent avec.
        blast: { variants: variants.length },
      });
      await this.products.save(product, ticket);
      await this.emitter.emitProducts([command.id]);
    });
  }

  /** Résout ce que la fiche ne voit pas, puis la laisse juger. */
  private async activate(product: Product): Promise<boolean> {
    const category = await requireCategory(this.categories, product.categoryId);
    const record = product.snapshot();
    const vat = await this.catalogue.vatPercents([record]);
    return product.activate(
      vat.get(record.id) ?? {},
      effectiveAudience(product.audience, category.audience),
    );
  }
}

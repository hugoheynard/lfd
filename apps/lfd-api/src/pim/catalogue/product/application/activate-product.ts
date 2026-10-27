import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { CatalogueReader } from "../../shared/domain/ports/catalogue-reader.js";
import type { Product } from "../domain/entities/product.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "./product-support.js";
import { CatalogEmitter } from "../../shared/domain/ports/catalog-emitter.js";
import { ActiveSalesContextsReader } from "../../../sales-contexts/domain/ports/active-sales-contexts.reader.js";
import { readCompletenessRules } from "./completeness-support.js";
import { CitedAllergensReader } from "../domain/ports/cited-allergens.reader.js";
import { CategoryRepository } from "../../category/domain/ports/category.repository.js";
import { requireCategory } from "../../category/application/category-support.js";

export class ActivateProductCommand {
  constructor(readonly id: string) {}
}

/**
 * Met le produit en vente — l'ancien « publier » (1e du plan
 * `plan-catalogue-synchronise-par-audience.md`). La route `/publish` et la
 * valeur de journal `product.published` restent : le front n'est touché qu'au
 * lot 3, et une valeur de journal ne se renomme pas.
 *
 * Le refus appartient à l'agrégat : au moins une déclinaison complète (lot 2b,
 * C1). Le handler ne fait que lui montrer ce qu'il ne voit pas : le taux
 * effectif résolu comme la projection le résout (`CatalogueReader.vatPercents`,
 * la même lecture que `feed-projection.service.ts`), les contextes de vente en
 * service, la règle du prix pro (`readCompletenessRules`) et les allergènes
 * que sa composition cite (`CitedAllergensReader`, jugement unique). L'audience
 * de la famille y entre de nouveau depuis le 2026-10-27, pour le seul prix :
 * une fiche n'exige que le prix d'une audience qu'elle vise
 * (`plan-prix-manquant-non-bloquant.md`) ; les taux, eux, restent exigés pour
 * tous les contextes en service.
 *
 * ⚠️ Les valeurs nutritionnelles n'entrent pas dans ce refus : le règlement
 * (UE) n° 1169/2011 les exempte dans les deux cas de vente de La Folie Coffee
 * (`plan-separer-allergenes-et-nutrition.md`, D2).
 */
@CommandHandler(ActivateProductCommand)
export class ActivateProductHandler implements ICommandHandler<ActivateProductCommand, void> {
  constructor(
    private readonly products: ProductRepository,
    private readonly catalogue: CatalogueReader,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly emitter: CatalogEmitter,
    private readonly contexts: ActiveSalesContextsReader,
    private readonly cited: CitedAllergensReader,
    private readonly categories: CategoryRepository,
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
    const record = product.snapshot();
    const [vat, rules, cited, category] = await Promise.all([
      this.catalogue.vatPercents([record]),
      readCompletenessRules(this.contexts),
      this.cited.ofProducts([record.id]),
      requireCategory(this.categories, record.categoryId),
    ]);
    return product.activate(
      vat.get(record.id) ?? {},
      rules,
      cited.get(record.id) ?? [],
      category.audience,
    );
  }
}

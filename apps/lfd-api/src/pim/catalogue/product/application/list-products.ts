import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { ActiveSalesContextsReader } from "../../../sales-contexts/domain/ports/active-sales-contexts.reader.js";
import { CategoryNotFoundError } from "../../category/domain/errors/category-errors.js";
import { CategoryRepository } from "../../category/domain/ports/category.repository.js";
import {
  CatalogueReader,
  type CategoryVatPercents,
} from "../../shared/domain/ports/catalogue-reader.js";
import type { Audience } from "../../shared/domain/value-objects/audience.js";
import type { Product, ProductSnapshot } from "../domain/entities/product.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import type { ActivationGaps } from "../domain/services/activation-gaps.js";
import type { CompletenessRules } from "../domain/services/variant-completeness.js";
import { audienceView, type AudienceView } from "./audience-view.js";
import { readCompletenessRules } from "./completeness-support.js";
import { CitedAllergensReader } from "../domain/ports/cited-allergens.reader.js";

/**
 * Ce qu'une activation dirait de la fiche — jugé par l'agrégat, avec le code
 * même qui accepte ou refuse `PUT :id/publish`. `activationGaps` vaut `null`
 * hors brouillon : une publiée n'a rien à activer, une archivée se restaure
 * d'abord ; dans les deux cas `activatable` est `false`.
 */
export interface ActivationView {
  readonly activatable: boolean;
  readonly activationGaps: ActivationGaps | null;
}

/** Une fiche telle que la liste la rend : son état, son audience résolue, son activabilité. */
export type ProductListItem = ProductSnapshot & AudienceView & ActivationView;

/** Lecture du catalogue — dispatchée par le `QueryBus`. Sans paramètre. */
export class ListProductsQuery {}

@QueryHandler(ListProductsQuery)
export class ListProductsHandler implements IQueryHandler<ListProductsQuery, ProductListItem[]> {
  constructor(
    private readonly products: ProductRepository,
    private readonly categories: CategoryRepository,
    private readonly catalogue: CatalogueReader,
    private readonly contexts: ActiveSalesContextsReader,
    private readonly cited: CitedAllergensReader,
  ) {}

  /**
   * Familles, taux, contextes et règle du prix pro sont lus UNE fois pour
   * toute la liste, jamais une fois par fiche. Une fiche rattachée à une
   * famille inconnue est un REFUS, comme dans le lecteur du catalogue : un
   * rattachement cassé ne se maquille pas en héritage.
   */
  async execute(): Promise<ProductListItem[]> {
    const [products, categories, rules] = await Promise.all([
      this.products.listAll(),
      this.categories.listAll(),
      readCompletenessRules(this.contexts),
    ]);
    const audiences = new Map<string, Audience>(
      categories.map((category) => [category.id, category.audience]),
    );
    const [vat, cited] = await Promise.all([
      this.catalogue.vatPercents(products.map((product) => product.snapshot())),
      this.cited.ofProducts(products.map((product) => product.id)),
    ]);
    return products.map((product) => {
      const categoryAudience = audiences.get(product.categoryId);
      if (categoryAudience === undefined) {
        throw new CategoryNotFoundError(product.categoryId);
      }
      return {
        ...product.snapshot(),
        ...audienceView(product, categoryAudience),
        ...activationView(product, vat.get(product.id) ?? {}, rules, cited.get(product.id) ?? []),
      };
    });
  }
}

function activationView(
  product: Product,
  vat: CategoryVatPercents,
  rules: CompletenessRules,
  citedAllergens: readonly string[],
): ActivationView {
  if (product.status !== "draft") {
    return { activatable: false, activationGaps: null };
  }
  return {
    activatable: product.isActivatableWith(vat, rules, citedAllergens),
    activationGaps: product.activationGapsWith(vat, rules, citedAllergens),
  };
}

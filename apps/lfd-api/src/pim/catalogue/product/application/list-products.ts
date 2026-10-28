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
import { IllustratedProductsReader } from "../domain/ports/illustrated-products.reader.js";

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
export type ProductListItem = ProductSnapshot &
  AudienceView &
  ActivationView & {
    /** Elle porte au moins une image (filtre « Sans image », 2026-10-28). */
    readonly illustrated: boolean;
  };

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
    private readonly illustrated: IllustratedProductsReader,
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
    const ids = products.map((product) => product.id);
    const [vat, cited, illustrated] = await Promise.all([
      this.catalogue.vatPercents(products.map((product) => product.snapshot())),
      this.cited.ofProducts(ids),
      this.illustrated.amongst(ids),
    ]);
    return products.map((product) => {
      const categoryAudience = audiences.get(product.categoryId);
      if (categoryAudience === undefined) {
        throw new CategoryNotFoundError(product.categoryId);
      }
      return {
        ...product.snapshot(),
        ...audienceView(product, categoryAudience),
        ...activationView(product, {
          vat: vat.get(product.id) ?? {},
          rules,
          citedAllergens: cited.get(product.id) ?? [],
          categoryAudience,
        }),
        illustrated: illustrated.has(product.id),
      };
    });
  }
}

/** Ce que la fiche ne voit pas d'elle-même, résolu pour la liste. */
interface Resolved {
  readonly vat: CategoryVatPercents;
  readonly rules: CompletenessRules;
  readonly citedAllergens: readonly string[];
  readonly categoryAudience: Audience;
}

function activationView(product: Product, resolved: Resolved): ActivationView {
  if (product.status !== "draft") {
    return { activatable: false, activationGaps: null };
  }
  const { vat, rules, citedAllergens, categoryAudience } = resolved;
  return {
    activatable: product.isActivatableWith(vat, rules, citedAllergens, categoryAudience),
    activationGaps: product.activationGapsWith(vat, rules, citedAllergens, categoryAudience),
  };
}

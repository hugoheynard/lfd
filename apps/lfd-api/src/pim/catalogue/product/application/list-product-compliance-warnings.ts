import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { ProductComplianceWarningView } from "@lfd/pim-contracts";

import { ActiveSalesContextsReader } from "../../../sales-contexts/domain/ports/active-sales-contexts.reader.js";
import { CatalogueReader } from "../../shared/domain/ports/catalogue-reader.js";
import { CitedAllergensReader } from "../domain/ports/cited-allergens.reader.js";
import { isLiveStatus, ProductRepository } from "../domain/ports/product.repository.js";
import type { Product } from "../domain/entities/product.js";
import { ProductNotFoundError } from "../domain/errors/product-errors.js";
import { readCompletenessRules } from "./completeness-support.js";
import { complianceFindingsOf } from "./compliance-view.js";
import { CategoryNotFoundError } from "../../category/domain/errors/category-errors.js";
import { CategoryRepository } from "../../category/domain/ports/category.repository.js";
import type { Audience } from "../../shared/domain/value-objects/audience.js";

/**
 * Les fiches non archivées qui portent au moins un constat de conformité.
 * `productId` : les constats de CETTE fiche seulement — la fiche qui vient
 * d'être publiée n'a pas à faire relire tout le catalogue.
 */
export class ListProductComplianceWarningsQuery {
  constructor(readonly productId: string | null = null) {}
}

/**
 * **Ce que la table des produits signale** — le jugement unique
 * (`Product.complianceWith`, celui qui accepte ou refuse l'activation) sur
 * toutes les fiches non archivées, quel que soit leur statut : une publiée ou
 * une activable peuvent porter un avertissement.
 *
 * Taux, contextes, audiences des familles et allergènes cités sont lus UNE fois
 * pour toute la liste, jamais par fiche — comme `ListProductsHandler`, qui rend
 * les mêmes constats dans ses lignes.
 *
 * 🔴 Une fiche absente n'est PAS certifiée conforme (D5) : la composition est
 * éditoriale ; seule l'absence de déclaration (précaution) se signale.
 *
 * @throws {ProductNotFoundError} `productId` ne désigne aucune fiche.
 */
@QueryHandler(ListProductComplianceWarningsQuery)
export class ListProductComplianceWarningsHandler implements IQueryHandler<
  ListProductComplianceWarningsQuery,
  ProductComplianceWarningView[]
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly catalogue: CatalogueReader,
    private readonly contexts: ActiveSalesContextsReader,
    private readonly cited: CitedAllergensReader,
    private readonly categories: CategoryRepository,
  ) {}

  async execute(
    query: ListProductComplianceWarningsQuery = new ListProductComplianceWarningsQuery(),
  ): Promise<ProductComplianceWarningView[]> {
    return query.productId === null ? this.all() : this.one(query.productId);
  }

  /** Tout le catalogue : les familles lues une fois servent aussi aux taux. */
  private async all(): Promise<ProductComplianceWarningView[]> {
    const [all, rules, categories] = await Promise.all([
      this.products.listAll(),
      readCompletenessRules(this.contexts),
      this.categories.listAll(),
    ]);
    const audiences = new Map<string, Audience>(
      categories.map((category) => [category.id, category.audience]),
    );
    // Archivées et supprimées n'ont rien à corriger : elles ne partent nulle part.
    const live = all.filter((product) => isLiveStatus(product.status));
    const [vat, cited] = await Promise.all([
      this.catalogue.vatPercents(
        live.map((product) => product.snapshot()),
        categories,
      ),
      this.cited.ofProducts(live.map((product) => product.id)),
    ]);
    return live.flatMap((product) =>
      warningsOf(
        product,
        complianceFindingsOf(product, {
          vat: vat.get(product.id) ?? {},
          rules,
          citedAllergens: cited.get(product.id) ?? [],
          categoryAudience: audienceOf(audiences, product),
        }),
      ),
    );
  }

  /** Une fiche : sa famille et ses taux par le chemin d'une fiche seule. */
  private async one(productId: string): Promise<ProductComplianceWarningView[]> {
    const product = await this.products.findById(productId);
    if (product === null) {
      throw new ProductNotFoundError(productId);
    }
    if (!isLiveStatus(product.status)) {
      return [];
    }
    const [rules, category, vat, cited] = await Promise.all([
      readCompletenessRules(this.contexts),
      this.categories.findById(product.categoryId),
      this.catalogue.vatPercents([product.snapshot()]),
      this.cited.ofProducts([product.id]),
    ]);
    if (category === null) {
      throw new CategoryNotFoundError(product.categoryId);
    }
    return warningsOf(
      product,
      complianceFindingsOf(product, {
        vat: vat.get(product.id) ?? {},
        rules,
        citedAllergens: cited.get(product.id) ?? [],
        categoryAudience: category.audience,
      }),
    );
  }
}

function audienceOf(audiences: ReadonlyMap<string, Audience>, product: Product): Audience {
  const audience = audiences.get(product.categoryId);
  if (audience === undefined) {
    throw new CategoryNotFoundError(product.categoryId);
  }
  return audience;
}

function warningsOf(
  product: Product,
  warnings: ProductComplianceWarningView["warnings"],
): ProductComplianceWarningView[] {
  return warnings.length === 0 ? [] : [{ productId: product.id, warnings }];
}

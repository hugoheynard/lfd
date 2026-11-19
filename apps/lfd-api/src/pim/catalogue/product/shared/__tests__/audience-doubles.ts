import { CATEGORY_ID } from "../../../category/application/__tests__/category-doubles.js";
import type { CategoryVatPercents } from "../../../shared/domain/value-objects/vat-percents.js";
import { Product, type ProductSnapshot } from "../../domain/entities/product.js";
import type { VariantSnapshot } from "../../domain/entities/variant.js";
import { AllProductsReader } from "../../domain/ports/all-products.reader.js";
import { EffectiveVatReader } from "../../domain/ports/effective-vat.reader.js";
import { ProductRepository, type ProductRecord } from "../../domain/ports/product.repository.js";

export {
  CATEGORY_ID,
  ListedCategories,
  OneCategory,
  family,
} from "../../../category/application/__tests__/category-doubles.js";

/**
 * Les doubles des suites d'audience et d'activation (lot 1 du plan
 * `plan-catalogue-synchronise-par-audience.md`) : chacun hérite du port qu'il
 * joue, et reconstitue à chaque lecture — le handler ne tient jamais
 * l'instance du test.
 */

export const PRODUCT_ID = "prd_tarte";

/** Une déclinaison par défaut nue : ni prix, ni allergènes. */
export function bareVariant(over: Partial<VariantSnapshot> = {}): VariantSnapshot {
  return {
    id: "prd_tarte_v1",
    sku: "PAT-7-1",
    name: { fr: "Tarte au citron" },
    options: {},
    isDefault: true,
    isDiscontinued: false,
    position: 0,
    priceCents: null,
    weightGrams: null,
    proPriceMillicents: null,
    proPricePerKgMillicents: null,
    publicPricePerKgTtcCents: null,
    pricePerKgShownPublic: true,
    pricePerKgShownPro: true,
    saleUnit: "piece",
    weightMinGrams: null,
    weightStepGrams: null,
    hasBeenPublished: false,
    regulatoryFollowsDefault: false,
    nutritionFollowsDefault: false,
    pricingFollowsDefault: false,
    minQuantities: { pro: null, public: null },
    minQuantityFollowsDefault: false,
    allergenSheet: null,
    nutrition: null,
    ...over,
  };
}

/**
 * Une déclinaison vendable : un prix public, un prix pro HT saisi (seule
 * source depuis le lot R3), une déclaration d'allergènes.
 */
export const SELLABLE_VARIANT = bareVariant({
  priceCents: 3_200,
  proPriceMillicents: 2_730_331,
  allergenSheet: { declared: ["gluten"], mayContain: [] },
});

export function tarte(over: Partial<ProductSnapshot> = {}): ProductSnapshot {
  return {
    id: PRODUCT_ID,
    sku: "PAT-7",
    name: { fr: "Tarte au citron" },
    slug: { fr: "tarte-au-citron" },
    kind: "made_to_order",
    categoryId: CATEGORY_ID,
    status: "draft",
    variants: [SELLABLE_VARIANT],
    vatByContext: {},
    operationOnly: false,
    requiresCold: false,
    audience: null,
    ...over,
  };
}

export class OneProduct extends ProductRepository {
  constructor(private current: ProductSnapshot | null) {
    super();
  }
  get stored(): ProductSnapshot | null {
    return this.current;
  }
  findById(id: string): Promise<Product | null> {
    return Promise.resolve(
      this.current !== null && id === this.current.id ? Product.reconstitute(this.current) : null,
    );
  }
  add(product: Product): Promise<void> {
    return this.save(product);
  }
  save(product: Product): Promise<void> {
    this.current = product.persistenceSnapshot();
    return Promise.resolve();
  }
}

/** La liste de toutes les fiches, lue sur la fiche seule du double. */
export class ListedProducts extends AllProductsReader {
  constructor(private readonly products: OneProduct) {
    super();
  }
  all(): Promise<Product[]> {
    const stored = this.products.stored;
    return Promise.resolve(stored === null ? [] : [Product.reconstitute(stored)]);
  }
}

/**
 * Le taux effectif réduit à ce que l'activation lit : les mêmes pourcentages,
 * par clé de contexte, pour toute fiche.
 */
export class FixedVatPercents extends EffectiveVatReader {
  constructor(private readonly percents: CategoryVatPercents) {
    super();
  }
  vatPercents(
    products: readonly ProductRecord[],
  ): Promise<ReadonlyMap<string, CategoryVatPercents>> {
    return Promise.resolve(new Map(products.map((product) => [product.id, this.percents])));
  }
}

/** Les deux taux qu'une audience `both` demande. */
export const BOTH_RATES: CategoryVatPercents = { b2b: 20, takeaway: 5.5 };

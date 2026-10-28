import { Category } from "../../../category/domain/entities/category.js";
import { CategoryRepository } from "../../../category/domain/ports/category.repository.js";
import {
  CatalogueReader,
  type CategoryVatPercents,
  type ChannelCategory,
} from "../../../shared/domain/ports/catalogue-reader.js";
import type { Audience } from "../../../shared/domain/value-objects/audience.js";
import { Product, type ProductSnapshot } from "../../domain/entities/product.js";
import type { VariantSnapshot } from "../../domain/entities/variant.js";
import type { ProductEditorialView } from "../../domain/ports/editorial-reader.js";
import { ProductRepository, type ProductRecord } from "../../domain/ports/product.repository.js";

/**
 * Les doubles des suites d'audience et d'activation (lot 1 du plan
 * `plan-catalogue-synchronise-par-audience.md`) : chacun hérite du port qu'il
 * joue, et reconstitue à chaque lecture — le handler ne tient jamais
 * l'instance du test.
 */

export const PRODUCT_ID = "prd_tarte";
export const CATEGORY_ID = "cat_patisserie";

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
    saleUnit: "piece",
    weightMinGrams: null,
    weightStepGrams: null,
    hasBeenPublished: false,
    regulatoryFollowsDefault: false,
    nutritionFollowsDefault: false,
    pricingFollowsDefault: false,
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
  listAll(): Promise<Product[]> {
    return Promise.resolve(this.current === null ? [] : [Product.reconstitute(this.current)]);
  }
  add(product: Product): Promise<void> {
    return this.save(product);
  }
  save(product: Product): Promise<void> {
    this.current = product.persistenceSnapshot();
    return Promise.resolve();
  }
}

/** Une famille, à l'audience donnée. */
export function family(audience: Audience, isArchived = false): Category {
  return Category.reconstitute({
    id: CATEGORY_ID,
    name: { fr: "Pâtisserie" },
    slug: { fr: "patisserie" },
    parentId: null,
    position: 0,
    isArchived,
    vatByContext: {},
    audience,
  });
}

/** Une seule famille, relue à chaque appel ; ce qu'on y écrit est gardé. */
export class OneCategory extends CategoryRepository {
  constructor(private current: Category | null) {
    super();
  }
  get stored(): Category | null {
    return this.current === null ? null : Category.reconstitute(this.current.snapshot());
  }
  findById(id: string): Promise<Category | null> {
    return Promise.resolve(id === this.current?.id ? this.stored : null);
  }
  listAll(): Promise<Category[]> {
    return Promise.resolve(this.stored === null ? [] : [this.stored]);
  }
  add(category: Category): Promise<void> {
    return this.save(category);
  }
  save(category: Category): Promise<void> {
    this.current = Category.reconstitute(category.snapshot());
    return Promise.resolve();
  }
  saveAll(): Promise<void> {
    return Promise.resolve();
  }
  findBySlugFr(): Promise<Category | null> {
    return Promise.resolve(null);
  }
  listChildren(): Promise<Category[]> {
    return Promise.resolve([]);
  }
  countActiveChildren(): Promise<number> {
    return Promise.resolve(0);
  }
  nextPosition(): Promise<number> {
    return Promise.resolve(0);
  }
}

/**
 * Le lecteur du catalogue réduit à ce que l'activation lit : les taux
 * effectifs, en pourcentages, par clé de contexte — les mêmes pour toute fiche.
 */
export class FixedVatPercents extends CatalogueReader {
  constructor(private readonly percents: CategoryVatPercents) {
    super();
  }
  vatPercents(
    products: readonly ProductRecord[],
  ): Promise<ReadonlyMap<string, CategoryVatPercents>> {
    return Promise.resolve(new Map(products.map((product) => [product.id, this.percents])));
  }
  publishable(): Promise<ProductRecord[]> {
    return Promise.resolve([]);
  }
  byIds(): Promise<ProductRecord[]> {
    return Promise.resolve([]);
  }
  channelCategories(): Promise<ChannelCategory[]> {
    return Promise.resolve([]);
  }
  editorials(): Promise<ReadonlyMap<string, ProductEditorialView>> {
    return Promise.resolve(new Map());
  }
}

/** Les deux taux qu'une audience `both` demande. */
export const BOTH_RATES: CategoryVatPercents = { b2b: 20, takeaway: 5.5 };

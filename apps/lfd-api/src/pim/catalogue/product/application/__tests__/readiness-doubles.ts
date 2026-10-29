import { Product, type ProductSnapshot } from "../../domain/entities/product.js";
import { ProductRepository } from "../../domain/ports/product.repository.js";
import {
  ReadinessRepository,
  type ProductReadiness,
} from "../../domain/ports/readiness.repository.js";

/**
 * Les doubles de la signature, partagés par sa pose et son retrait.
 *
 * `NOW` est absolu et c'est permis : il n'est comparé qu'à lui-même, à travers
 * une `FixedClock` qu'on lui passe.
 */
export const PRODUCT_ID = "prd_1";
export const NOW = new Date("2026-08-31T09:00:00.000Z");

export function snapshot(status: ProductSnapshot["status"]): ProductSnapshot {
  return {
    id: PRODUCT_ID,
    sku: "CAFE-1",
    name: { fr: "Café" },
    slug: { fr: "cafe" },
    kind: "resale",
    categoryId: "cat_1",
    status,
    vatByContext: {},
    operationOnly: false,
    requiresCold: false,
    audience: null,
    variants: [
      {
        id: "prd_1_v1",
        sku: "CAFE-1-1",
        name: { fr: "Café" },
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
        minQuantities: { pro: {}, public: {} },
        minQuantityFollowsDefault: false,
        allergenSheet: null,
        nutrition: null,
      },
    ],
  };
}

export class FakeProducts extends ProductRepository {
  constructor(private readonly stored: ProductSnapshot | null) {
    super();
  }
  findById(id: string): Promise<Product | null> {
    const found = this.stored !== null && this.stored.id === id ? this.stored : null;
    return Promise.resolve(found === null ? null : Product.reconstitute(found));
  }
  listAll(): Promise<Product[]> {
    return Promise.resolve([]);
  }
  add(): Promise<void> {
    return Promise.resolve();
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
}

export class FakeReadiness extends ReadinessRepository {
  declared: ProductReadiness | null = null;

  read(): Promise<ProductReadiness | null> {
    return Promise.resolve(this.declared);
  }
  readMany(): Promise<ReadonlyMap<string, ProductReadiness>> {
    return Promise.resolve(new Map());
  }
  contentUpdatedAt(): Promise<Date | null> {
    return Promise.resolve(NOW);
  }
  declare(_productId: string, readiness: ProductReadiness): Promise<void> {
    this.declared = readiness;
    return Promise.resolve();
  }
  withdraw(): Promise<void> {
    this.declared = null;
    return Promise.resolve();
  }
}

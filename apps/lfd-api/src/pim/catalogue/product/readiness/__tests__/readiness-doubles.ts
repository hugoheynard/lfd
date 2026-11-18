import { PimJournalReader, type PimJournalFact } from "../../../../journal/pim-journal-reader.js";
import { Product, type ProductSnapshot } from "../../domain/entities/product.js";
import { ProductRepository } from "../../domain/ports/product.repository.js";
import {
  ProductReadiness,
  type ReadinessSignature,
} from "../../domain/entities/product-readiness.js";
import { ReadinessReader } from "../../domain/ports/readiness.reader.js";
import { ReadinessRepository } from "../../domain/ports/readiness.repository.js";

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

/** Le dépôt de la signature : `declared` est ce que la « base » porte. */
export class FakeReadiness extends ReadinessRepository {
  declared: ReadinessSignature | null = null;

  load(productId: string): Promise<ProductReadiness> {
    return Promise.resolve(
      this.declared === null
        ? ProductReadiness.unsigned(productId)
        : ProductReadiness.signed(productId, this.declared),
    );
  }
  save(readiness: ProductReadiness): Promise<void> {
    this.declared = readiness.signature;
    return Promise.resolve();
  }
}

/** Les lectures de la signature, sur la « base » du double d'écriture. */
export class FakeReadinessReader extends ReadinessReader {
  constructor(
    private readonly store: FakeReadiness = new FakeReadiness(),
    private readonly contentDate: Date | null = NOW,
  ) {
    super();
  }
  read(): Promise<ReadinessSignature | null> {
    return Promise.resolve(this.store.declared);
  }
  readMany(): Promise<ReadonlyMap<string, ReadinessSignature>> {
    return Promise.resolve(new Map());
  }
  contentUpdatedAt(): Promise<Date | null> {
    return Promise.resolve(this.contentDate);
  }
}

/** L'historique de la fiche : les types de faits qu'on lui donne, rien d'autre. */
export class FakeProductHistory extends PimJournalReader {
  constructor(private readonly types: readonly string[] = []) {
    super();
  }

  factsAbout(): Promise<readonly PimJournalFact[]> {
    return Promise.resolve(
      this.types.map((type) => ({
        type,
        subjectType: "product",
        subjectId: PRODUCT_ID,
        occurredAt: NOW,
        actorName: null,
        payload: {},
      })),
    );
  }
  factsBetween(): Promise<readonly PimJournalFact[]> {
    return Promise.resolve([]);
  }
}

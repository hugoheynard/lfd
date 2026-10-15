import type { SyncVariant } from "@lfd/catalog-sync";

import {
  CatalogCategoryChangedFact,
  CatalogFactPayloadError,
} from "../../../../../pim/channels/b2b-platform/products/catalog-category-changed.fact.js";
import type {
  CatalogFamilyFactBody,
  CatalogProductFactBody,
} from "../../../../../pim/channels/b2b-platform/products/catalog-facts.js";
import { CatalogProductChangedFact } from "../../../../../pim/channels/b2b-platform/products/catalog-product-changed.fact.js";
import type { ReceivedCatalogProduct } from "../../../domain/catalog-product-facts.js";
import type { PimFacts } from "../../../domain/entities/catalog-item.js";
import type { CatalogCategoryFacts } from "../../../domain/ports/catalog-category.projection.js";
import { CatalogFamilyFactsProjection } from "../../../domain/ports/catalog-family-facts.projection.js";
import { CatalogProductFactsProjection } from "../../../domain/ports/catalog-product-facts.projection.js";
import type { CatalogAudience } from "../../../domain/served-to.js";
import { OnCatalogCategoryChangedHandler } from "../on-catalog-category-changed.handler.js";
import { OnCatalogProductChangedHandler } from "../on-catalog-product-changed.handler.js";

/**
 * Les récepteurs des faits du catalogue (2a4) : l'ORCHESTRATION — famille
 * d'abord, entrée sous condition, puis mise en vente et retrait. L'écriture
 * conditionnée elle-même, la double livraison et la survie des décisions se
 * prouvent en e2e, contre le vrai SQL.
 */

const EMITTED = "2030-01-01T09:00:00.000Z";

const FAMILY: CatalogFamilyFactBody = {
  id: "fam_1",
  name: "Viennoiseries",
  slug: "viennoiseries",
  parentId: null,
  position: 0,
  vatRatePercent: 5.5,
  audience: "both",
  archived: false,
};

const VARIANT: SyncVariant = {
  id: "var_1",
  sku: "VIE-1-1",
  name: "Croissant",
  priceMillicents: 100_000,
  publicTtcCents: 120,
  publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents: 113_744 } },
  weightGrams: 60,
  isDefault: true,
  position: 0,
  vatRatePercent: 5.5,
  allergens: ["UW"],
  allergenLabels: { labels: [{ category: "gluten", label: "Gluten" }], incomplete: false },
};

function productFact(
  status: CatalogProductFactBody["status"],
  over: Partial<CatalogProductFactBody> = {},
): CatalogProductChangedFact {
  return new CatalogProductChangedFact("prd_1", 7, EMITTED, {
    status,
    audience: "pro",
    product: {
      id: "prd_1",
      sku: "VIE-1",
      name: "Croissant",
      categoryId: FAMILY.id,
      kind: "daily",
      note: null,
      image: null,
      thumbnail: null,
      operationOnly: false,
      requiresCold: false,
    },
    variants: [VARIANT],
    gaps: {},
    family: FAMILY,
    ...over,
  });
}

/** La projection doublée : elle retient l'ordre des appels et ce qu'ils portaient. */
class SpyingProduct extends CatalogProductFactsProjection {
  readonly calls: string[] = [];
  entry: ReceivedCatalogProduct | null = null;
  onSale: readonly PimFacts[] = [];
  audience: CatalogAudience | null = null;
  kept: readonly string[] = [];

  constructor(private readonly newer: boolean) {
    super();
  }
  recordEntryIfNewer(product: ReceivedCatalogProduct): Promise<boolean> {
    this.calls.push("entry");
    this.entry = product;
    return Promise.resolve(this.newer);
  }
  ensureFamily(family: CatalogCategoryFacts): Promise<void> {
    this.calls.push(`family:${family.id}`);
    return Promise.resolve();
  }
  putOnSale(items: readonly PimFacts[], audience: CatalogAudience): Promise<void> {
    this.calls.push("onSale");
    this.onSale = items;
    this.audience = audience;
    return Promise.resolve();
  }
  withdrawOthers(productId: string, keptSkus: readonly string[]): Promise<void> {
    this.calls.push(`withdraw:${productId}`);
    this.kept = keptSkus;
    return Promise.resolve();
  }
}

async function deliver(
  projection: CatalogProductFactsProjection,
  fact: CatalogProductChangedFact,
): Promise<void> {
  await new OnCatalogProductChangedHandler(projection).handle({
    eventId: "evt_1",
    ...fact.durableFact(),
  });
}

describe("OnCatalogProductChangedHandler", () => {
  it("crée la famille d'abord, écrit l'entrée, met en vente, retire le reste", async () => {
    const projection = new SpyingProduct(true);

    await deliver(projection, productFact("active"));

    expect(projection.calls).toEqual(["family:fam_1", "entry", "onSale", "withdraw:prd_1"]);
    expect(projection.entry).toMatchObject({
      productId: "prd_1",
      seq: 7,
      status: "active",
      audience: "pro",
      receivedAt: new Date(EMITTED),
    });
    expect(projection.onSale.map((item) => item.sku)).toEqual(["VIE-1-1"]);
    expect(projection.onSale[0]).toMatchObject({ priceMillicents: 100_000, orderTimeLimit: null });
    expect(projection.audience).toBe("pro");
    expect(projection.kept).toEqual(["VIE-1-1"]);
  });

  /** Un fait plus ancien que la ligne — rejoué, ou livré à l'envers — n'écrit rien d'autre. */
  it("s'arrête après l'entrée si un fait plus récent est déjà appliqué", async () => {
    const projection = new SpyingProduct(false);

    await deliver(projection, productFact("active"));

    expect(projection.calls).toEqual(["family:fam_1", "entry"]);
  });

  it("retire toutes les déclinaisons d'une fiche inactive, sans rien mettre en vente", async () => {
    const projection = new SpyingProduct(true);

    await deliver(projection, productFact("inactive"));

    expect(projection.onSale).toEqual([]);
    expect(projection.kept).toEqual([]);
    expect(projection.calls).toContain("withdraw:prd_1");
  });

  it("lève sur un fait illisible : la livraison se rejoue, rien n'est avalé", async () => {
    const projection = new SpyingProduct(true);

    await expect(
      new OnCatalogProductChangedHandler(projection).handle({
        eventId: "evt_1",
        type: "pim.catalog_product_changed",
        payload: { productId: "prd_1", seq: "sept" },
      }),
    ).rejects.toBeInstanceOf(CatalogFactPayloadError);
    expect(projection.calls).toEqual([]);
  });
});

class SpyingFamily extends CatalogFamilyFactsProjection {
  applied: { family: CatalogCategoryFacts; seq: number } | null = null;
  applyIfNewer(family: CatalogCategoryFacts, seq: number): Promise<boolean> {
    this.applied = { family, seq };
    return Promise.resolve(true);
  }
}

describe("OnCatalogCategoryChangedHandler", () => {
  it("applique la famille sous son numéro", async () => {
    const projection = new SpyingFamily();
    const fact = new CatalogCategoryChangedFact("fam_1", 12, EMITTED, FAMILY);

    await new OnCatalogCategoryChangedHandler(projection).handle({
      eventId: "evt_2",
      ...fact.durableFact(),
    });

    expect(projection.applied).toEqual({
      seq: 12,
      family: {
        id: "fam_1",
        name: "Viennoiseries",
        slug: "viennoiseries",
        parentId: null,
        position: 0,
        vatRatePercent: 5.5,
        receivedAt: new Date(EMITTED),
      },
    });
  });
});

import {
  CatalogCategoryChangedFact,
  CatalogFactPayloadError,
} from "../../../../../pim/channels/b2b-platform/products/catalog-category-changed.fact.js";
import type {
  CatalogFamilyFactBody,
  CatalogProductFactBody,
  CatalogVariantFact,
} from "../../../../../pim/channels/b2b-platform/products/catalog-facts.js";
import { CatalogProductChangedFact } from "../../../../../pim/channels/b2b-platform/products/catalog-product-changed.fact.js";
import type {
  ReceivedCatalogItem,
  ReceivedCatalogProduct,
} from "../../../domain/catalog-product-facts.js";
import {
  CatalogFamilyFactsProjection,
  type ReceivedCatalogFamily,
} from "../../../domain/ports/catalog-family-facts.projection.js";
import { RecordingOrderLimits } from "../../../domain/ports/__tests__/recording-order-limits.js";
import { OrderLimitsRefresher } from "../../order-limits-refresher.service.js";
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
  nameTranslations: {},
};

const VARIANT: CatalogVariantFact = {
  id: "var_1",
  sku: "VIE-1-1",
  name: "Croissant",
  priceMillicents: 100_000,
  publicTtcCents: 120,
  proPricePerKgMillicents: null,
  publicPricePerKgTtcCents: null,
  publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents: 113_744 } },
  weightGrams: 60,
  isDefault: true,
  position: 0,
  vatRatePercent: 5.5,
  allergens: ["UW"],
  allergenLabels: { labels: [{ category: "gluten", label: "Gluten" }], incomplete: false },
  mayContain: null,
  allergensPrecautionary: false,
  allergenTexts: null,
  nameTranslations: { en: "Butter croissant" },
};

function productFact(
  status: CatalogProductFactBody["status"],
  over: Partial<CatalogProductFactBody> = {},
): CatalogProductChangedFact {
  return new CatalogProductChangedFact("prd_1", 7, EMITTED, {
    status,
    audience: "pro",
    audienceInherited: false,
    product: {
      id: "prd_1",
      sku: "VIE-1",
      name: "Croissant",
      categoryId: FAMILY.id,
      kind: "daily",
      note: null,
      noteTranslations: {},
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
  onSale: readonly ReceivedCatalogItem[] = [];
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
  ensureFamily(family: ReceivedCatalogFamily): Promise<void> {
    this.calls.push(`family:${family.id}`);
    return Promise.resolve();
  }
  putOnSale(items: readonly ReceivedCatalogItem[], audience: CatalogAudience): Promise<void> {
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

/** La descente des limites, sur un double qui retient les fiches demandées. */
function refresher(limits = new RecordingOrderLimits([])): OrderLimitsRefresher {
  return new OrderLimitsRefresher(limits);
}

async function deliver(
  projection: CatalogProductFactsProjection,
  fact: CatalogProductChangedFact,
  limits = new RecordingOrderLimits([]),
): Promise<void> {
  await new OnCatalogProductChangedHandler(projection, refresher(limits)).handle({
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
    expect(projection.onSale[0]).toMatchObject({
      variantId: "var_1",
      priceMillicents: 100_000,
      orderTimeLimit: null,
    });
    expect(projection.audience).toBe("pro");
    expect(projection.kept).toEqual(["VIE-1-1"]);
  });

  /** Un fait plus ancien que la ligne — rejoué, ou livré à l'envers — n'écrit rien d'autre. */
  it("s'arrête après l'entrée si un fait plus récent est déjà appliqué", async () => {
    const projection = new SpyingProduct(false);
    const limits = new RecordingOrderLimits([]);

    await deliver(projection, productFact("active"), limits);

    expect(projection.calls).toEqual(["family:fam_1", "entry"]);
    expect(limits.asked).toEqual([]);
  });

  /** Lot 2b : un article neuf reçoit ses limites — descendues de l'échelle reçue. */
  it("redescend les limites de commande des articles de la fiche, après la mise en vente", async () => {
    const projection = new SpyingProduct(true);
    const limits = new RecordingOrderLimits([]);

    await deliver(projection, productFact("active"), limits);

    expect(limits.asked).toEqual(["prd_1"]);
  });

  it("retire toutes les déclinaisons d'une fiche inactive, sans rien mettre en vente", async () => {
    const projection = new SpyingProduct(true);

    await deliver(projection, productFact("inactive"));

    expect(projection.onSale).toEqual([]);
    expect(projection.kept).toEqual([]);
    expect(projection.calls).toContain("withdraw:prd_1");
  });

  /** Règle B (2026-10-27) : les traces et la précaution descendent sur l'article. */
  it("porte les traces et la précaution d'une déclinaison sans déclaration", async () => {
    const projection = new SpyingProduct(true);
    const precautionary: CatalogVariantFact = {
      ...VARIANT,
      allergens: [],
      allergenLabels: { labels: [], incomplete: false },
      mayContain: ["UW", "AM"],
      allergensPrecautionary: true,
    };

    await deliver(projection, productFact("active", { variants: [precautionary] }));

    expect(projection.onSale[0]).toMatchObject({
      allergens: [],
      mayContain: ["UW", "AM"],
      allergensPrecautionary: true,
    });
  });

  /** Les libellés par langue descendent sur l'article (`plan-allergenes-en-boutique.md`). */
  it("porte les libellés d'allergènes par langue jusqu'à l'article", async () => {
    const projection = new SpyingProduct(true);
    const allergenTexts = {
      fr: { contains: ["Gluten"], mayContain: [] },
      en: { contains: ["Gluten"], mayContain: [] },
    };

    await deliver(projection, productFact("active", { variants: [{ ...VARIANT, allergenTexts }] }));

    expect(projection.onSale[0]).toMatchObject({ allergenTexts });
  });

  /** Un fait émis avant les deux champs se rejoue avec le sens d'avant. */
  it("lit un fait d'avant les traces comme « on ne sait pas », sans précaution", async () => {
    const projection = new SpyingProduct(true);
    const durable = productFact("active").durableFact();
    const payload = JSON.parse(JSON.stringify(durable.payload)) as {
      variants: Record<string, unknown>[];
    };
    for (const variant of payload.variants) {
      delete variant["mayContain"];
      delete variant["allergensPrecautionary"];
      delete variant["allergenTexts"];
    }

    await new OnCatalogProductChangedHandler(projection, refresher()).handle({
      eventId: "evt_1",
      type: durable.type,
      payload,
    });

    expect(projection.onSale[0]).toMatchObject({
      mayContain: null,
      allergensPrecautionary: false,
      allergenTexts: null,
    });
  });

  it("lève sur un fait illisible : la livraison se rejoue, rien n'est avalé", async () => {
    const projection = new SpyingProduct(true);

    await expect(
      new OnCatalogProductChangedHandler(projection, refresher()).handle({
        eventId: "evt_1",
        type: "pim.catalog_product_changed",
        payload: { productId: "prd_1", seq: "sept" },
      }),
    ).rejects.toBeInstanceOf(CatalogFactPayloadError);
    expect(projection.calls).toEqual([]);
  });
});

class SpyingFamily extends CatalogFamilyFactsProjection {
  applied: { family: ReceivedCatalogFamily; seq: number } | null = null;
  constructor(private readonly newer = true) {
    super();
  }
  applyIfNewer(family: ReceivedCatalogFamily, seq: number): Promise<boolean> {
    this.applied = { family, seq };
    return Promise.resolve(this.newer);
  }
}

describe("OnCatalogCategoryChangedHandler", () => {
  it("applique la famille sous son numéro", async () => {
    const projection = new SpyingFamily();
    const fact = new CatalogCategoryChangedFact("fam_1", 12, EMITTED, FAMILY);

    await new OnCatalogCategoryChangedHandler(projection, refresher()).handle({
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
        audience: "both",
        archived: false,
        nameTranslations: {},
      },
    });
  });

  /** Lot 2b : une famille déplacée change la lignée de ses descendantes. */
  it("redescend les limites de tous les articles quand la famille s'applique", async () => {
    const limits = new RecordingOrderLimits([]);
    const fact = new CatalogCategoryChangedFact("fam_1", 12, EMITTED, FAMILY);

    await new OnCatalogCategoryChangedHandler(new SpyingFamily(), refresher(limits)).handle({
      eventId: "evt_3",
      ...fact.durableFact(),
    });

    expect(limits.asked).toEqual([null]);
  });

  it("ne redescend rien quand un fait plus récent est déjà appliqué", async () => {
    const limits = new RecordingOrderLimits([]);
    const fact = new CatalogCategoryChangedFact("fam_1", 12, EMITTED, FAMILY);

    await new OnCatalogCategoryChangedHandler(new SpyingFamily(false), refresher(limits)).handle({
      eventId: "evt_4",
      ...fact.durableFact(),
    });

    expect(limits.asked).toEqual([]);
  });

  it("porte l'archivage et l'audience de la famille", async () => {
    const projection = new SpyingFamily();
    const fact = new CatalogCategoryChangedFact("fam_1", 13, EMITTED, {
      ...FAMILY,
      audience: "public",
      archived: true,
    });

    await new OnCatalogCategoryChangedHandler(projection, refresher()).handle({
      eventId: "evt_5",
      ...fact.durableFact(),
    });

    expect(projection.applied?.family).toMatchObject({ audience: "public", archived: true });
  });
});

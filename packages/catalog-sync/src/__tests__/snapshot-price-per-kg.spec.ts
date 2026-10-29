import {
  CATALOG_SNAPSHOT_VERSION,
  catalogSnapshotSchema,
  storedCatalogSnapshotSchema,
  syncVariantSchema,
} from "../snapshot.js";

/**
 * **Les prix au kilo sur le fil, depuis la v13**
 * (`documentation/pricing/plan-prix-au-kilo.md`, K2) : obligatoires et
 * nullables pour l'émetteur, tolérés absents pour une arrivée stockée d'avant.
 */

const variant = {
  id: "var_1",
  sku: "VIE-001-1",
  name: "Croissant",
  priceMillicents: 200,
  weightGrams: 60,
  isDefault: true,
  position: 0,
  vatRatePercent: 5.5,
  publicTtcCents: 250,
  publicByContext: {},
  allergens: [],
  allergenLabels: null,
  proPricePerKgMillicents: 3_333_333,
  publicPricePerKgTtcCents: 4_160,
  saleUnit: "piece",
  weightMinGrams: null,
  weightStepGrams: null,
  minQuantities: { pro: null, public: null },
};

function snapshotOf(version: number, variants: readonly Record<string, unknown>[]) {
  return {
    version,
    generatedAt: "2026-08-17T09:00:00+02:00",
    categories: [],
    products: [
      {
        id: "prd_1",
        sku: "VIE-001",
        name: "Croissant",
        categoryId: "cat_vien",
        kind: "daily",
        variants,
        note: null,
        image: null,
        thumbnail: null,
        operationOnly: false,
        requiresCold: false,
        variantsAsTiles: true,
      },
    ],
    orderTimeLimits: [],
    operations: [],
  };
}

function without(key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(variant).filter(([name]) => name !== key));
}

describe("syncVariantSchema — les prix au kilo", () => {
  it("traversent depuis la v13", () => {
    expect(CATALOG_SNAPSHOT_VERSION).toBeGreaterThanOrEqual(13);
  });

  it("accepte les deux montants, et les deux à `null` — non saisis", () => {
    expect(syncVariantSchema.safeParse(variant).success).toBe(true);
    expect(
      syncVariantSchema.safeParse({
        ...variant,
        proPricePerKgMillicents: null,
        publicPricePerKgTtcCents: null,
      }).success,
    ).toBe(true);
  });

  it("exige chaque champ : un émetteur qui l'oublie échoue", () => {
    expect(syncVariantSchema.safeParse(without("proPricePerKgMillicents")).success).toBe(false);
    expect(syncVariantSchema.safeParse(without("publicPricePerKgTtcCents")).success).toBe(false);
  });

  it("refuse un zéro, un négatif ou une fraction", () => {
    for (const bad of [0, -1, 12.5]) {
      expect(
        syncVariantSchema.safeParse({ ...variant, publicPricePerKgTtcCents: bad }).success,
      ).toBe(false);
      expect(
        syncVariantSchema.safeParse({ ...variant, proPricePerKgMillicents: bad }).success,
      ).toBe(false);
    }
  });
});

describe("storedCatalogSnapshotSchema — une arrivée d'avant la v13", () => {
  const v12 = snapshotOf(
    12,
    [without("proPricePerKgMillicents")].map((v) => {
      const { publicPricePerKgTtcCents, ...rest } = v;
      void publicPricePerKgTtcCents;
      return rest;
    }),
  );

  it("se relit sans les prix au kilo", () => {
    const parsed = storedCatalogSnapshotSchema.safeParse(v12);

    expect(parsed.success).toBe(true);
    expect(parsed.data?.products[0]?.variants[0]?.proPricePerKgMillicents).toBeUndefined();
  });

  it("reste refusée par le schéma du fil", () => {
    expect(catalogSnapshotSchema.safeParse(v12).success).toBe(false);
  });

  it("une v13 se relit avec ses montants", () => {
    const parsed = storedCatalogSnapshotSchema.safeParse(snapshotOf(13, [variant]));

    expect(parsed.data?.products[0]?.variants[0]?.publicPricePerKgTtcCents).toBe(4_160);
  });
});

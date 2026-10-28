import {
  CATALOG_SNAPSHOT_VERSION,
  catalogSnapshotSchema,
  storedCatalogSnapshotSchema,
  syncVariantSchema,
} from "../snapshot.js";

/**
 * **L'unité de vente sur le fil, depuis la v14**
 * (`documentation/pricing/plan-vente-au-poids.md`, P2) : obligatoire pour
 * l'émetteur, tolérée absente pour une arrivée stockée d'avant — qui se lit
 * alors à la pièce, ce qu'elle était.
 */

const piece = {
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
  proPricePerKgMillicents: null,
  publicPricePerKgTtcCents: null,
  saleUnit: "piece",
  weightMinGrams: null,
  weightStepGrams: null,
};

const byWeight = {
  ...piece,
  sku: "GRA-001-1",
  saleUnit: "weight",
  weightMinGrams: 200,
  weightStepGrams: 100,
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
      },
    ],
    orderTimeLimits: [],
    operations: [],
  };
}

function withoutSaleTerms(): Record<string, unknown> {
  const { saleUnit, weightMinGrams, weightStepGrams, ...rest } = piece;
  void saleUnit;
  void weightMinGrams;
  void weightStepGrams;
  return rest;
}

describe("syncVariantSchema — l'unité de vente", () => {
  it("le fil est en v14", () => {
    expect(CATALOG_SNAPSHOT_VERSION).toBe(14);
  });

  it("accepte une pièce, et un article au poids avec son pas et son minimum", () => {
    expect(syncVariantSchema.safeParse(piece).success).toBe(true);
    expect(syncVariantSchema.safeParse(byWeight).success).toBe(true);
    expect(syncVariantSchema.safeParse({ ...byWeight, weightMinGrams: null }).success).toBe(true);
  });

  it("exige chacun des trois champs : un émetteur qui l'oublie échoue", () => {
    for (const key of ["saleUnit", "weightMinGrams", "weightStepGrams"]) {
      const rest = Object.fromEntries(Object.entries(byWeight).filter(([name]) => name !== key));
      expect(syncVariantSchema.safeParse(rest).success).toBe(false);
    }
  });

  it("refuse une unité inconnue", () => {
    expect(syncVariantSchema.safeParse({ ...piece, saleUnit: "kg" }).success).toBe(false);
  });

  it("refuse un pas ou un minimum nul, négatif ou fractionnaire", () => {
    for (const bad of [0, -100, 12.5]) {
      expect(syncVariantSchema.safeParse({ ...byWeight, weightStepGrams: bad }).success).toBe(
        false,
      );
      expect(syncVariantSchema.safeParse({ ...byWeight, weightMinGrams: bad }).success).toBe(false);
    }
  });
});

describe("storedCatalogSnapshotSchema — une arrivée d'avant la v14", () => {
  const v13 = snapshotOf(13, [withoutSaleTerms()]);

  it("se relit sans l'unité : la version dit « à la pièce »", () => {
    const parsed = storedCatalogSnapshotSchema.safeParse(v13);

    expect(parsed.success).toBe(true);
    expect(parsed.data?.version).toBe(13);
    expect(parsed.data?.products[0]?.variants[0]?.saleUnit).toBeUndefined();
  });

  it("reste refusée par le schéma du fil", () => {
    expect(catalogSnapshotSchema.safeParse(v13).success).toBe(false);
  });

  it("une v14 au poids se relit avec son pas et son minimum", () => {
    const parsed = storedCatalogSnapshotSchema.safeParse(snapshotOf(14, [byWeight]));

    expect(parsed.data?.products[0]?.variants[0]).toMatchObject({
      saleUnit: "weight",
      weightMinGrams: 200,
      weightStepGrams: 100,
    });
  });

  it("une v14 est acceptée par le fil", () => {
    expect(catalogSnapshotSchema.safeParse(snapshotOf(14, [piece, byWeight])).success).toBe(true);
  });
});

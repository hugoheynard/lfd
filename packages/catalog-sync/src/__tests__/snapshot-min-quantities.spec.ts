import {
  CATALOG_SNAPSHOT_VERSION,
  storedCatalogSnapshotSchema,
  syncMinQuantitiesSchema,
  syncVariantSchema,
} from "../snapshot.js";

/**
 * **La quantité minimale sur le fil, depuis la v15**
 * (`documentation/catalogue/plan-quantite-minimale.md`, M2) : obligatoire pour
 * l'émetteur, tolérée absente d'une arrivée stockée d'avant.
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
  proPricePerKgMillicents: null,
  publicPricePerKgTtcCents: null,
  saleUnit: "piece",
  weightMinGrams: null,
  weightStepGrams: null,
  minQuantities: { pro: { b2b: 6 }, public: { takeaway: 2 } },
};

describe("syncMinQuantitiesSchema", () => {
  it("le fil est en v15", () => {
    expect(CATALOG_SNAPSHOT_VERSION).toBe(15);
  });

  it("accepte une grille, et la grille vide — aucun minimum", () => {
    expect(syncMinQuantitiesSchema.safeParse(variant.minQuantities).success).toBe(true);
    expect(syncMinQuantitiesSchema.safeParse({ pro: {}, public: {} }).success).toBe(true);
  });

  it("refuse 1, zéro, une fraction : 1 ne dit rien", () => {
    for (const bad of [1, 0, -2, 2.5]) {
      expect(syncMinQuantitiesSchema.safeParse({ pro: { b2b: bad }, public: {} }).success).toBe(
        false,
      );
    }
  });

  it("refuse une audience inconnue", () => {
    expect(
      syncMinQuantitiesSchema.safeParse({ pro: {}, public: {}, both: { b2b: 2 } }).success,
    ).toBe(false);
  });

  it("l'émetteur qui l'oublie échoue", () => {
    const { minQuantities, ...rest } = variant;
    void minQuantities;
    expect(syncVariantSchema.safeParse(variant).success).toBe(true);
    expect(syncVariantSchema.safeParse(rest).success).toBe(false);
  });

  it("une arrivée stockée v14 se relit sans elle", () => {
    const { minQuantities, ...rest } = variant;
    void minQuantities;
    const parsed = storedCatalogSnapshotSchema.safeParse({
      version: 14,
      generatedAt: "2026-08-17T09:00:00+02:00",
      categories: [],
      products: [
        {
          id: "prd_1",
          sku: "VIE-001",
          name: "Croissant",
          categoryId: "cat_vien",
          kind: "daily",
          variants: [rest],
          note: null,
          image: null,
          thumbnail: null,
          operationOnly: false,
          requiresCold: false,
        },
      ],
      orderTimeLimits: [],
      operations: [],
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.products[0]?.variants[0]?.minQuantities).toBeUndefined();
  });
});

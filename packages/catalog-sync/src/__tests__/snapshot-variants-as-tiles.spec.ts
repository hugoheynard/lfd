import {
  CATALOG_SNAPSHOT_VERSION,
  storedCatalogSnapshotSchema,
  syncProductSchema,
} from "../snapshot.js";

/**
 * **L'option « chaque déclinaison en vignette » sur le fil, depuis la v16**
 * (`documentation/catalogue/plan-declinaisons-en-vignette.md`, V2) :
 * obligatoire pour l'émetteur, tolérée absente d'une arrivée stockée d'avant.
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
  minQuantities: { pro: null, public: null },
};

const product = {
  id: "prd_1",
  sku: "VIE-001",
  name: "Croissant",
  categoryId: "cat_vien",
  kind: "daily",
  variants: [variant],
  note: null,
  image: null,
  thumbnail: null,
  operationOnly: false,
  requiresCold: false,
  variantsAsTiles: false,
};

describe("syncProductSchema — variantsAsTiles", () => {
  it("le fil est en v16", () => {
    expect(CATALOG_SNAPSHOT_VERSION).toBe(16);
  });

  it("porte l'option telle que la fiche la dit", () => {
    const parsed = syncProductSchema.safeParse(product);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.variantsAsTiles).toBe(false);
  });

  it("l'émetteur qui l'oublie échoue", () => {
    const { variantsAsTiles, ...rest } = product;
    void variantsAsTiles;
    expect(syncProductSchema.safeParse(rest).success).toBe(false);
  });

  it("une arrivée stockée v15 se relit sans elle", () => {
    const { variantsAsTiles, ...rest } = product;
    void variantsAsTiles;
    const parsed = storedCatalogSnapshotSchema.safeParse({
      version: 15,
      generatedAt: "2026-08-17T09:00:00+02:00",
      categories: [],
      products: [rest],
      orderTimeLimits: [],
      operations: [],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.products[0]?.variantsAsTiles).toBeUndefined();
  });
});

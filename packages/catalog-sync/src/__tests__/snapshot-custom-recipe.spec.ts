import {
  CATALOG_SNAPSHOT_VERSION,
  storedCatalogSnapshotSchema,
  syncProductSchema,
} from "../snapshot.js";

/**
 * **Le sur mesure sur le fil, depuis la v17**
 * (`documentation/catalogue/plan-articles-sur-mesure.md` § 13, D1) :
 * obligatoire pour l'émetteur, toléré absent d'une arrivée stockée d'avant.
 */

const product = {
  id: "prd_1",
  sku: "VIE-001",
  name: "Croissant",
  categoryId: "cat_vien",
  kind: "daily",
  variants: [
    {
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
    },
  ],
  note: null,
  image: null,
  thumbnail: null,
  operationOnly: false,
  requiresCold: false,
  variantsAsTiles: true,
  customRecipe: true,
};

describe("syncProductSchema — customRecipe", () => {
  it("le fil est en v17", () => {
    expect(CATALOG_SNAPSHOT_VERSION).toBe(17);
  });

  it("porte le fait tel que la fiche le dit", () => {
    const parsed = syncProductSchema.safeParse(product);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.customRecipe).toBe(true);
  });

  it("l'émetteur qui l'oublie échoue", () => {
    const { customRecipe, ...rest } = product;
    void customRecipe;
    expect(syncProductSchema.safeParse(rest).success).toBe(false);
  });

  it("une arrivée stockée v16 se relit sans lui", () => {
    const { customRecipe, ...rest } = product;
    void customRecipe;
    const parsed = storedCatalogSnapshotSchema.safeParse({
      version: 16,
      generatedAt: "2026-08-17T09:00:00+02:00",
      categories: [],
      products: [rest],
      orderTimeLimits: [],
      operations: [],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.products[0]?.customRecipe).toBeUndefined();
  });
});

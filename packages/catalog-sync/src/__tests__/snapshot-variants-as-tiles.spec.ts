import { storedCatalogSnapshotSchema, syncProductSchema } from "../snapshot.js";

/**
 * **L'option « chaque déclinaison en vignette » ne voyage plus** : toute
 * déclinaison en vente paraît au rayon. Le récepteur la tolère absente comme
 * présente — un fait émis avant reste lisible — sans nouvelle version du fil.
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
  customRecipe: false,
  optionGroups: [],
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
};

describe("syncProductSchema — variantsAsTiles", () => {
  it("une fiche sans l'option se reçoit", () => {
    const parsed = syncProductSchema.safeParse(product);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.variantsAsTiles).toBeUndefined();
  });

  it("une fiche émise avant, qui la porte encore, se reçoit aussi", () => {
    expect(syncProductSchema.safeParse({ ...product, variantsAsTiles: false }).success).toBe(true);
  });

  it("une arrivée stockée v15 se relit sans elle", () => {
    const parsed = storedCatalogSnapshotSchema.safeParse({
      version: 15,
      generatedAt: "2026-08-17T09:00:00+02:00",
      categories: [],
      products: [product],
      orderTimeLimits: [],
      operations: [],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.products[0]?.variantsAsTiles).toBeUndefined();
  });
});

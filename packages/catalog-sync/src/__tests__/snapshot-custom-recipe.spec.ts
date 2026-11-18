import {
  CATALOG_SNAPSHOT_VERSION,
  storedCatalogSnapshotSchema,
  syncProductSchema,
  syncVariantSchema,
} from "../snapshot.js";

/**
 * **Le sur mesure sur le fil, par déclinaison depuis la v18**
 * (`documentation/catalogue/plan-sur-mesure-par-declinaison.md`, V3) :
 * obligatoire pour l'émetteur sur chaque déclinaison, toléré absent d'une
 * arrivée stockée d'avant — et la v17 relue garde son en-tête.
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
  customRecipe: true,
};

const product = {
  id: "prd_1",
  sku: "VIE-001",
  name: "Croissant",
  categoryId: "cat_vien",
  kind: "daily",
  variants: [
    variant,
    { ...variant, id: "var_2", sku: "VIE-001-2", isDefault: false, customRecipe: false },
  ],
  note: null,
  image: null,
  thumbnail: null,
  operationOnly: false,
  requiresCold: false,
  variantsAsTiles: true,
};

function stored(version: number, products: readonly unknown[]) {
  return storedCatalogSnapshotSchema.safeParse({
    version,
    generatedAt: "2026-08-17T09:00:00+02:00",
    categories: [],
    products,
    orderTimeLimits: [],
    operations: [],
  });
}

describe("syncVariantSchema — customRecipe", () => {
  it("le fil est en v18", () => {
    expect(CATALOG_SNAPSHOT_VERSION).toBe(18);
  });

  it("porte le fait de CHAQUE déclinaison", () => {
    const parsed = syncProductSchema.safeParse(product);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.variants.map((v) => v.customRecipe)).toEqual([true, false]);
  });

  it("l'émetteur qui l'oublie sur une déclinaison échoue", () => {
    const { customRecipe, ...rest } = variant;
    void customRecipe;
    expect(syncVariantSchema.safeParse(rest).success).toBe(false);
  });

  it("l'en-tête ne le porte plus", () => {
    const parsed = syncProductSchema.safeParse({ ...product, customRecipe: true });
    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty("customRecipe");
  });

  it("une arrivée stockée v17 se relit avec son en-tête, sans le champ de déclinaison", () => {
    const { customRecipe, ...bare } = variant;
    void customRecipe;
    const parsed = stored(17, [{ ...product, variants: [bare], customRecipe: true }]);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.products[0]?.customRecipe).toBe(true);
    expect(parsed.data?.products[0]?.variants[0]?.customRecipe).toBeUndefined();
  });

  it("une arrivée stockée v16 se relit sans aucun des deux", () => {
    const { customRecipe, ...bare } = variant;
    void customRecipe;
    const parsed = stored(16, [{ ...product, variants: [bare] }]);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.products[0]?.customRecipe).toBeUndefined();
  });
});

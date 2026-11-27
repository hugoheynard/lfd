import {
  CATALOG_SNAPSHOT_VERSION,
  storedCatalogSnapshotSchema,
  syncOptionGroupSchema,
  syncVariantSchema,
} from "../snapshot.js";

/**
 * **Les options de commande sur le fil, par déclinaison depuis la v19**
 * (`documentation/catalogue/plan-options-de-commande.md`, § 3.2) :
 * obligatoires pour l'émetteur, tolérées absentes d'une arrivée stockée
 * d'avant. Aucun prix ne traverse avec elles.
 */

const TRANCHAGE = {
  id: "grp_tranchage",
  name: "Tranchage",
  choices: [{ key: "tranche", label: "Tranché", audience: "both" }],
};

const variant = {
  id: "var_1",
  sku: "PAI-001-1",
  name: "Pain de campagne",
  priceMillicents: 200,
  weightGrams: 500,
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
  optionGroups: [TRANCHAGE],
};

function stored(version: number, variants: readonly unknown[]) {
  return storedCatalogSnapshotSchema.safeParse({
    version,
    generatedAt: "2026-11-19T09:00:00+01:00",
    categories: [],
    products: [
      {
        id: "prd_1",
        sku: "PAI-001",
        name: "Pain de campagne",
        categoryId: "cat_pain",
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
  });
}

describe("syncVariantSchema — optionGroups", () => {
  it("le fil est en v19", () => {
    expect(CATALOG_SNAPSHOT_VERSION).toBe(19);
  });

  it("porte les groupes actifs de la déclinaison, choix compris", () => {
    const parsed = syncVariantSchema.safeParse(variant);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.optionGroups).toEqual([TRANCHAGE]);
  });

  it("l'émetteur qui les oublie échoue", () => {
    const { optionGroups, ...rest } = variant;
    void optionGroups;
    expect(syncVariantSchema.safeParse(rest).success).toBe(false);
  });

  it("refuse un groupe sans choix : « sans » est implicite", () => {
    expect(syncOptionGroupSchema.safeParse({ ...TRANCHAGE, choices: [] }).success).toBe(false);
  });

  it("refuse une clientèle hors des trois, réassort compris", () => {
    const resupply = { ...TRANCHAGE, choices: [{ key: "a", label: "A", audience: "resupply" }] };
    expect(syncOptionGroupSchema.safeParse(resupply).success).toBe(false);
  });

  it("refuse un prix sur un choix : les options sont gratuites", () => {
    const priced = { ...TRANCHAGE, choices: [{ ...TRANCHAGE.choices[0], priceCents: 50 }] };
    expect(syncOptionGroupSchema.safeParse(priced).success).toBe(false);
  });

  it("une arrivée stockée v18 se relit sans options", () => {
    const { optionGroups, ...bare } = variant;
    void optionGroups;
    const parsed = stored(18, [bare]);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.products[0]?.variants[0]?.optionGroups).toBeUndefined();
  });

  it("une arrivée stockée v19 garde ses options", () => {
    const parsed = stored(19, [variant]);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.products[0]?.variants[0]?.optionGroups).toEqual([TRANCHAGE]);
  });
});

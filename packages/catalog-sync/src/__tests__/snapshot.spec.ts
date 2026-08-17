import { CATALOG_SNAPSHOT_VERSION, catalogSnapshotSchema, syncVariantSchema } from "../snapshot.js";

/**
 * Ce que ces tests éprouvent, ce n'est pas Zod : c'est que **les refus promis par
 * la doc sont réellement des refus**. Chacun correspond à une phrase de
 * `architecture-catalogue-synchronise.md` — si l'un tombe, c'est la doc qui ment.
 */

const variant = {
  sku: "VIE-001-1",
  name: "Croissant",
  priceCents: 200,
  weightGrams: null,
  isDefault: true,
  position: 0,
};

const snapshot = {
  version: CATALOG_SNAPSHOT_VERSION,
  generatedAt: "2026-08-17T09:00:00+02:00",
  categories: [
    {
      id: "cat_vien",
      name: "Viennoiseries",
      slug: "viennoiseries",
      parentId: null,
      position: 0,
      vatRatePercent: 5.5,
    },
  ],
  products: [
    {
      id: "prd_1",
      sku: "VIE-001",
      name: "Croissant",
      categoryId: "cat_vien",
      kind: "daily",
      variants: [variant],
    },
  ],
};

describe("catalogSnapshotSchema", () => {
  it("accepte un snapshot complet", () => {
    expect(catalogSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it("refuse une version de format inconnue plutôt que d'ingérer à moitié", () => {
    const future = { ...snapshot, version: 2 };

    expect(catalogSnapshotSchema.safeParse(future).success).toBe(false);
  });

  it("refuse un produit sans déclinaison — il n'y aurait rien à vendre", () => {
    const empty = {
      ...snapshot,
      products: [{ ...snapshot.products[0], variants: [] }],
    };

    expect(catalogSnapshotSchema.safeParse(empty).success).toBe(false);
  });

  it("refuse un instant d'émission sans fuseau", () => {
    const naive = { ...snapshot, generatedAt: "2026-08-17T09:00:00" };

    expect(catalogSnapshotSchema.safeParse(naive).success).toBe(false);
  });

  it("accepte un catalogue vide — une boutique peut n'avoir encore rien publié", () => {
    const nothing = { ...snapshot, categories: [], products: [] };

    expect(catalogSnapshotSchema.safeParse(nothing).success).toBe(true);
  });
});

describe("syncVariantSchema", () => {
  it("refuse une déclinaison sans prix, au lieu de la lire en gratuite", () => {
    const priceless: Record<string, unknown> = { ...variant };
    delete priceless.priceCents;

    expect(syncVariantSchema.safeParse(priceless).success).toBe(false);
  });

  it("refuse un prix à virgule — l'argent est en centimes entiers", () => {
    expect(syncVariantSchema.safeParse({ ...variant, priceCents: 2.5 }).success).toBe(false);
  });

  it("refuse un prix négatif", () => {
    expect(syncVariantSchema.safeParse({ ...variant, priceCents: -1 }).success).toBe(false);
  });

  it("accepte un poids absent — tout ne se pèse pas", () => {
    expect(syncVariantSchema.safeParse({ ...variant, weightGrams: null }).success).toBe(true);
  });
});

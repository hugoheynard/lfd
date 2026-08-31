import { CATALOG_SNAPSHOT_VERSION, catalogSnapshotSchema, syncVariantSchema } from "../snapshot.js";

/**
 * Ce que ces tests éprouvent, ce n'est pas Zod : c'est que **les refus promis par
 * la doc sont réellement des refus**. Chacun correspond à une phrase de
 * `architecture-catalogue-synchronise.md` — si l'un tombe, c'est la doc qui ment.
 */

const variant = {
  sku: "VIE-001-1",
  name: "Croissant",
  priceMillicents: 200,
  weightGrams: null,
  isDefault: true,
  position: 0,
  vatRatePercent: 5.5,
  allergens: ["AW"],
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
      allergens: ["AW"],
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
    // Dérivée, jamais écrite en dur : le test disait `2`, qui est devenu la
    // version COURANTE le jour où le taux est descendu sur l'article. Un
    // numéro figé finit toujours par désigner le présent.
    const future = { ...snapshot, version: CATALOG_SNAPSHOT_VERSION + 1 };

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
    delete priceless.priceMillicents;

    expect(syncVariantSchema.safeParse(priceless).success).toBe(false);
  });

  it("refuse un prix à virgule — l'argent est en centimes entiers", () => {
    expect(syncVariantSchema.safeParse({ ...variant, priceMillicents: 2.5 }).success).toBe(false);
  });

  it("refuse un prix négatif", () => {
    expect(syncVariantSchema.safeParse({ ...variant, priceMillicents: -1 }).success).toBe(false);
  });

  it("accepte un poids absent — tout ne se pèse pas", () => {
    expect(syncVariantSchema.safeParse({ ...variant, weightGrams: null }).success).toBe(true);
  });
});

describe("le taux de TVA de l’article", () => {
  /**
   * Depuis la v2, c'est l'ARTICLE qui porte son taux. Le rendre facultatif
   * aurait laissé un émetteur l'oublier, et le récepteur aurait facturé sur un
   * taux hérité d'une jointure — précisément ce que le déplacement corrige.
   */
  it("est obligatoire — un article muet sur sa TVA n’est pas un article", () => {
    const sansTaux: Record<string, unknown> = { ...variant };
    delete sansTaux["vatRatePercent"];

    expect(syncVariantSchema.safeParse(sansTaux).success).toBe(false);
  });

  /** `null` est une réponse : « famille non réglée », donc non vendable. */
  it("accepte `null`, qui dit « pas de taux » sans mentir", () => {
    expect(syncVariantSchema.safeParse({ ...variant, vatRatePercent: null }).success).toBe(true);
  });

  it("refuse un taux négatif", () => {
    expect(syncVariantSchema.safeParse({ ...variant, vatRatePercent: -1 }).success).toBe(false);
  });
});

describe("les allergènes de l’article", () => {
  /**
   * Les trois états doivent traverser le fil sans se confondre — c'est la seule
   * faute qui compte sur ce champ : un oubli de saisie affiché comme une
   * promesse au consommateur.
   */
  it("distingue « pas de fiche » de « fiche sans allergène »", () => {
    expect(syncVariantSchema.safeParse({ ...variant, allergens: null }).success).toBe(true);
    expect(syncVariantSchema.safeParse({ ...variant, allergens: [] }).success).toBe(true);

    const sansFiche = syncVariantSchema.parse({ ...variant, allergens: null });
    const ficheVide = syncVariantSchema.parse({ ...variant, allergens: [] });
    expect(sansFiche.allergens).toBeNull();
    expect(ficheVide.allergens).toEqual([]);
  });

  it("exige le champ : un article muet sur ses allergènes n’est pas un article sans allergène", () => {
    const muet: Record<string, unknown> = { ...variant };
    delete muet["allergens"];
    expect(syncVariantSchema.safeParse(muet).success).toBe(false);
  });

  it("refuse un code vide", () => {
    expect(syncVariantSchema.safeParse({ ...variant, allergens: [""] }).success).toBe(false);
  });
});

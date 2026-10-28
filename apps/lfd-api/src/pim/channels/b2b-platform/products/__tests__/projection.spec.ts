import { AllergenStore } from "../../../../allergens/application/__tests__/in-memory-allergens.js";
import { AllergenNaming } from "../../../../allergens/domain/services/allergen-naming.js";
import type { VariantRecord } from "../../../../catalogue/product/domain/ports/product.repository.js";
import { projectVariant, vatOf, type AllergenContext } from "../projection.js";

/** Ni composition citée, ni catalogue publié : la déclinaison parle seule. */
const NOTHING_ELSE: AllergenContext = { cited: [], catalogueUnion: [] };

function variant(over: Partial<VariantRecord> = {}): VariantRecord {
  return {
    id: "var_1",
    sku: "VIE-001-1",
    name: { fr: "Croissant" },
    options: {},
    isDefault: true,
    isDiscontinued: false,
    position: 0,
    priceCents: 200,
    weightGrams: null,
    proPriceMillicents: null,
    proPricePerKgMillicents: null,
    publicPricePerKgTtcCents: null,
    saleUnit: "piece",
    weightMinGrams: null,
    weightStepGrams: null,
    hasBeenPublished: false,
    regulatoryFollowsDefault: false,
    nutritionFollowsDefault: false,
    pricingFollowsDefault: false,
    // « Aucun allergène », une déclaration : depuis le lot 2b, une déclinaison
    // sans déclaration ne part plus (`variant_sans_allergenes`), et ces cas
    // parlent d'autre chose.
    allergenSheet: { declared: [], mayContain: [] },
    nutrition: null,
    ...over,
  };
}

/**
 * Le référentiel d'allergènes tel que la base le sert, **passé** à la projection
 * (D6). Trois entrées suffisent à couvrir les trois sorts d'un code déclaré :
 *
 * - `UW` (blé) et `NR` (seigle) — deux codes qui retombent sur UNE mention,
 *   c'est le n:1 qui est la raison d'être du modèle ;
 * - `SO` (noix de coco) — officiel, **sans obligation UE**, donc écarté de la
 *   mention d'étiquette sans être inconnu.
 */
const INCO = incoProjector();

function incoProjector(): AllergenNaming {
  const store = new AllergenStore();
  store.seedOfficialCategory("alg_cat_gluten", "gluten", "gluten");
  store.seedOfficialEntry("alg_UW", "UW", "alg_cat_gluten");
  store.seedOfficialEntry("alg_NR", "NR", "alg_cat_gluten");
  store.seedOfficialCategory("alg_cat_non_eu", "non_eu", null);
  store.seedOfficialEntry("alg_SO", "SO", "alg_cat_non_eu");
  return AllergenNaming.from(catalogueOf(store));
}

/** Le lecteur est asynchrone ; la projection, elle, reçoit un objet pur. */
function catalogueOf(store: AllergenStore) {
  const categories = [...store.categories.values()].sort((a, b) => a.position - b.position);
  return categories.map((category) => ({
    ...category,
    entries: [...store.entries.values()]
      .filter((entry) => entry.categoryId === category.id)
      .map(({ categoryId, ...entry }) => {
        void categoryId;
        return entry;
      }),
  }));
}

/**
 * **La conversion d'une déclinaison vers le fil** — ce qui reste du push
 * depuis X4 (`documentation/catalogue/catalogue-synchronise.md` §6) : les faits
 * du catalogue la réemploient. Les cas de `projectCatalog` (tri, exclusions,
 * matrice, opérations) sont partis avec lui ; ceux-ci parlent de la seule
 * conversion.
 */
describe("projectVariant", () => {
  const percents = { takeaway: 5.5, eatIn: 10, b2b: 5.5 };

  /** Fil v14 (`plan-vente-au-poids.md`, P2) : l'unité traverse telle que saisie. */
  it("porte l'unité de vente, le pas et le minimum d'une déclinaison au poids", () => {
    const weighed = variant({ saleUnit: "weight", weightMinGrams: 200, weightStepGrams: 100 });

    const v = projectVariant(weighed, 151_659, 5.5, 200, percents, INCO, NOTHING_ELSE);

    expect(v).toMatchObject({ saleUnit: "weight", weightMinGrams: 200, weightStepGrams: 100 });
  });

  it("porte une pièce à la pièce, sans pas ni minimum", () => {
    const v = projectVariant(variant(), 151_659, 5.5, 200, percents, INCO, NOTHING_ELSE);

    expect(v).toMatchObject({ saleUnit: "piece", weightMinGrams: null, weightStepGrams: null });
  });

  it("porte l'ÉTIQUETTE en centimes et une entrée par contexte réglé", () => {
    const v = projectVariant(variant(), 151_659, 5.5, 200, percents, INCO, NOTHING_ELSE);

    expect(v.publicTtcCents).toBe(200);
    // 2,00 € à 5,5 % → 189 573 millicentimes ; à 10 % → 181 818.
    expect(v.publicByContext).toEqual({
      takeaway: { vatRatePercent: 5.5, htMillicents: 189_573 },
      eatIn: { vatRatePercent: 10, htMillicents: 181_818 },
      b2b: { vatRatePercent: 5.5, htMillicents: 189_573 },
    });
  });

  /**
   * 🔴 `priceMillicents` (le prix PRO) et `publicByContext.b2b.htMillicents`
   * (l'étiquette au taux b2b) sont deux hors taxe du même article : les
   * confondre facturerait un particulier au tarif professionnel.
   */
  it("🔴 ne confond pas le prix PRO et le prix PUBLIC au même taux", () => {
    const v = projectVariant(variant(), 151_659, 5.5, 200, percents, INCO, NOTHING_ELSE);

    expect(v.priceMillicents).toBe(151_659);
    expect(v.publicByContext["b2b"]?.htMillicents).toBe(189_573);
  });

  it("n'invente AUCUN taux : un contexte non réglé n'a pas d'entrée", () => {
    const v = projectVariant(variant(), 151_659, 5.5, 200, { b2b: 5.5 }, INCO, NOTHING_ELSE);

    expect(Object.keys(v.publicByContext)).toEqual(["b2b"]);
  });

  it("porte les codes ET leurs mentions, dédoublonnées en n:1", () => {
    const sheet = { declared: ["UW", "NR"], mayContain: [] };
    const v = projectVariant(
      variant({ allergenSheet: sheet }),
      1,
      5.5,
      200,
      percents,
      INCO,
      NOTHING_ELSE,
    );

    expect(v.allergens).toEqual(["UW", "NR"]);
    expect(v.allergenLabels).toEqual({
      labels: [{ category: "gluten", label: "gluten" }],
      incomplete: false,
    });
  });

  /**
   * Régression (2026-10-26) : une fiche à la noix de coco partait en
   * `{ labels: [], incomplete: true }` — « un allergène en plus, mais on ne
   * sait pas lequel ». Un code connu hors obligation UE est NOMMÉ.
   */
  it("nomme un allergène hors obligation UE au lieu de déclarer la liste incomplète", () => {
    const sheet = { declared: ["UW", "SO"], mayContain: [] };
    const v = projectVariant(
      variant({ allergenSheet: sheet }),
      1,
      5.5,
      200,
      percents,
      INCO,
      NOTHING_ELSE,
    );

    expect(v.allergenLabels).toEqual({
      labels: [
        { category: "gluten", label: "gluten" },
        { category: "SO", label: "SO" },
      ],
      incomplete: false,
    });
  });

  it("ne lève `incomplete` que pour un code que le référentiel ne range nulle part", () => {
    const sheet = { declared: ["UW", "ZZ"], mayContain: [] };
    const v = projectVariant(
      variant({ allergenSheet: sheet }),
      1,
      5.5,
      200,
      percents,
      INCO,
      NOTHING_ELSE,
    );

    expect(v.allergenLabels).toEqual({
      labels: [{ category: "gluten", label: "gluten" }],
      incomplete: true,
    });
  });

  /**
   * Retourné le 2026-10-27 (règle B de `plan-allergenes-jamais-bloquants.md`) :
   * « aucune fiche » ne part plus à `null` mais par PRÉCAUTION — et c'est le
   * drapeau, pas la liste, qui la distingue de « fiche sans allergène ».
   */
  it("distingue « aucune fiche » (précaution) de « fiche sans allergène » ([])", () => {
    const none = projectVariant(variant({ allergenSheet: null }), 1, 5.5, 200, percents, INCO, {
      cited: ["UW"],
      catalogueUnion: ["UW", "AM", "NR"],
    });
    const empty = projectVariant(variant(), 1, 5.5, 200, percents, INCO, NOTHING_ELSE);

    expect(none).toMatchObject({
      allergens: ["UW"],
      mayContain: ["AM", "NR"],
      allergensPrecautionary: true,
    });
    expect(empty).toMatchObject({ allergens: [], mayContain: [], allergensPrecautionary: false });
    expect(empty.allergenLabels).toEqual({ labels: [], incomplete: false });
  });

  it("porte les traces déclarées, sans un allergène servi, et sans l'union du catalogue", () => {
    const v = projectVariant(
      variant({ allergenSheet: { declared: ["UW"], mayContain: ["AM", "NR"] } }),
      1,
      5.5,
      200,
      percents,
      INCO,
      { cited: ["AM"], catalogueUnion: ["SE"] },
    );

    expect(v).toMatchObject({
      allergens: ["UW", "AM"],
      mayContain: ["NR"],
      allergensPrecautionary: false,
    });
  });
});

describe("vatOf", () => {
  it("lit le taux du contexte b2b, et null quand il n'est pas réglé", () => {
    expect(vatOf({ takeaway: 10, b2b: 5.5 })).toBe(5.5);
    expect(vatOf({ takeaway: 10 })).toBeNull();
  });
});

/**
 * Les libellés que le client lit, langue par langue
 * (`documentation/pim/plan-allergenes-en-boutique.md`, 2026-10-27) : le
 * référentiel les nomme, la boutique ne recopie aucun dictionnaire.
 */
describe("projectVariant — les libellés par langue", () => {
  const entry = (code: string, name: { fr: string; en?: string; it?: string }) => ({
    id: `alg_${code}`,
    code,
    name,
    official: true,
    archivedAt: null,
  });
  const TRANSLATED = AllergenNaming.from([
    {
      id: "alg_cat_gluten",
      key: "gluten",
      name: { fr: "Gluten", en: "Gluten", it: "Glutine" },
      incoCategory: "gluten",
      official: true,
      position: 1,
      archivedAt: null,
      entries: [entry("UW", { fr: "Blé" }), entry("NR", { fr: "Seigle" })],
    },
    {
      id: "alg_cat_tree_nuts",
      key: "tree_nuts",
      name: { fr: "Fruits à coque", en: "Tree nuts" },
      incoCategory: "tree_nuts",
      official: true,
      position: 2,
      archivedAt: null,
      entries: [entry("SA", { fr: "Amande" })],
    },
  ]);

  it("nomme les allergènes et les traces en fr, en et it — le français quand rien n'est traduit", () => {
    const v = projectVariant(
      variant({ allergenSheet: { declared: ["UW"], mayContain: ["SA"] } }),
      1,
      5.5,
      200,
      { b2b: 5.5 },
      TRANSLATED,
      NOTHING_ELSE,
    );

    expect(v.allergenTexts).toEqual({
      fr: { contains: ["Gluten"], mayContain: ["Fruits à coque"] },
      en: { contains: ["Gluten"], mayContain: ["Tree nuts"] },
      it: { contains: ["Glutine"], mayContain: ["Fruits à coque"] },
    });
  });

  it("ne répète pas en trace une mention déjà parmi les allergènes", () => {
    const v = projectVariant(
      variant({ allergenSheet: { declared: ["UW"], mayContain: ["NR"] } }),
      1,
      5.5,
      200,
      { b2b: 5.5 },
      TRANSLATED,
      NOTHING_ELSE,
    );

    expect(v.allergenTexts?.["fr"]).toEqual({ contains: ["Gluten"], mayContain: [] });
  });

  it("nomme la précaution : la composition en allergènes, l'union du catalogue en traces", () => {
    const v = projectVariant(
      variant({ allergenSheet: null }),
      1,
      5.5,
      200,
      { b2b: 5.5 },
      TRANSLATED,
      {
        cited: [],
        catalogueUnion: ["UW", "SA"],
      },
    );

    expect(v.allergensPrecautionary).toBe(true);
    expect(v.allergenTexts?.["en"]).toEqual({ contains: [], mayContain: ["Gluten", "Tree nuts"] });
  });
});

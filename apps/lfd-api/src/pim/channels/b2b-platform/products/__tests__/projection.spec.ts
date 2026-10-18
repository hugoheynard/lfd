import { AllergenStore } from "../../../../allergens/application/__tests__/in-memory-allergens.js";
import { IncoProjector } from "../../../../allergens/domain/services/inco-projector.js";
import type { VariantRecord } from "../../../../catalogue/product/domain/ports/product.repository.js";
import { projectVariant, vatOf } from "../projection.js";

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

function incoProjector(): IncoProjector {
  const store = new AllergenStore();
  store.seedOfficialCategory("alg_cat_gluten", "gluten", "gluten");
  store.seedOfficialEntry("alg_UW", "UW", "alg_cat_gluten");
  store.seedOfficialEntry("alg_NR", "NR", "alg_cat_gluten");
  store.seedOfficialCategory("alg_cat_non_eu", "non_eu", null);
  store.seedOfficialEntry("alg_SO", "SO", "alg_cat_non_eu");
  return IncoProjector.from(catalogueOf(store), "fr");
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

  it("porte l'ÉTIQUETTE en centimes et une entrée par contexte réglé", () => {
    const v = projectVariant(variant(), 151_659, 5.5, 200, percents, INCO);

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
    const v = projectVariant(variant(), 151_659, 5.5, 200, percents, INCO);

    expect(v.priceMillicents).toBe(151_659);
    expect(v.publicByContext["b2b"]?.htMillicents).toBe(189_573);
  });

  it("n'invente AUCUN taux : un contexte non réglé n'a pas d'entrée", () => {
    const v = projectVariant(variant(), 151_659, 5.5, 200, { b2b: 5.5 }, INCO);

    expect(Object.keys(v.publicByContext)).toEqual(["b2b"]);
  });

  it("porte les codes ET leurs mentions, dédoublonnées en n:1", () => {
    const sheet = { declared: ["UW", "NR"], mayContain: [] };
    const v = projectVariant(variant({ allergenSheet: sheet }), 1, 5.5, 200, percents, INCO);

    expect(v.allergens).toEqual(["UW", "NR"]);
    expect(v.allergenLabels).toEqual({
      labels: [{ category: "gluten", label: "gluten" }],
      incomplete: false,
    });
  });

  it("distingue « aucune fiche » (null) de « fiche sans allergène » ([])", () => {
    const none = projectVariant(variant({ allergenSheet: null }), 1, 5.5, 200, percents, INCO);
    const empty = projectVariant(variant(), 1, 5.5, 200, percents, INCO);

    expect([none.allergens, none.allergenLabels]).toEqual([null, null]);
    expect(empty.allergenLabels).toEqual({ labels: [], incomplete: false });
  });
});

describe("vatOf", () => {
  it("lit le taux du contexte b2b, et null quand il n'est pas réglé", () => {
    expect(vatOf({ takeaway: 10, b2b: 5.5 })).toBe(5.5);
    expect(vatOf({ takeaway: 10 })).toBeNull();
  });
});

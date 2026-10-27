import { shopAllergensOf, type ShopAllergenFacts } from "../shop-allergens.js";

/** Ce que la vitrine dit des allergènes (plan « la boutique affiche les allergènes », 2026-10-27). */
const TEXTS = {
  fr: { contains: ["Gluten"], mayContain: ["Fruits à coque"] },
  en: { contains: ["Gluten"], mayContain: ["Tree nuts"] },
};

function facts(over: Partial<ShopAllergenFacts> = {}): ShopAllergenFacts {
  return { codes: ["UW"], incomplete: false, precautionary: false, texts: TEXTS, ...over };
}

describe("shopAllergensOf", () => {
  it("rend les allergènes déclarés et les traces, dans la langue demandée", () => {
    expect(shopAllergensOf(facts(), "en")).toEqual({
      state: "declared",
      contains: ["Gluten"],
      mayContain: ["Tree nuts"],
    });
  });

  it("retombe sur le français pour une langue sans libellés", () => {
    expect(shopAllergensOf(facts(), "it")?.mayContain).toEqual(["Fruits à coque"]);
  });

  it("dit « aucun allergène » seulement quand c'est déclaré", () => {
    expect(
      shopAllergensOf(facts({ codes: [], texts: { fr: { contains: [], mayContain: [] } } }), "fr"),
    ).toEqual({ state: "none", contains: [], mayContain: [] });
  });

  it("dit la précaution, même avec une composition muette", () => {
    const precautionary = facts({
      codes: [],
      precautionary: true,
      texts: { fr: { contains: [], mayContain: ["Gluten", "Lait"] } },
    });

    expect(shopAllergensOf(precautionary, "fr")).toEqual({
      state: "precautionary",
      contains: [],
      mayContain: ["Gluten", "Lait"],
    });
  });

  it("ne dit rien d'un article reçu avant les libellés", () => {
    expect(shopAllergensOf(facts({ texts: null }), "fr")).toBeNull();
  });

  it("ne dit rien d'un article sans fiche", () => {
    expect(shopAllergensOf(facts({ codes: null }), "fr")).toBeNull();
  });

  it("ne présente jamais une liste amputée comme complète", () => {
    expect(shopAllergensOf(facts({ incomplete: true }), "fr")).toBeNull();
  });

  it("ne dit rien quand des codes déclarés n'ont aucun libellé", () => {
    expect(
      shopAllergensOf(facts({ texts: { fr: { contains: [], mayContain: [] } } }), "fr"),
    ).toBeNull();
  });
});

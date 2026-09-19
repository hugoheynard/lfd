import { erasedVat } from "../context-vat.js";

/**
 * Ce qu'une fermeture de canal a effacé, dans la charge des faits
 * `*.vat_changed` — ce que la comptabilité relit (Hugo, 2026-09-19).
 */
describe("erasedVat", () => {
  it("rend chaque taux disparu, en `{ from, to: null }`", () => {
    expect(erasedVat({ b2b: "tva_20", takeaway: "tva_55" }, { takeaway: "tva_55" })).toEqual({
      b2b: { from: "tva_20", to: null },
    });
  });

  it("ne rend rien quand aucun taux n'a disparu", () => {
    expect(erasedVat({ takeaway: "tva_55" }, { takeaway: "tva_55" })).toEqual({});
    expect(erasedVat({}, {})).toEqual({});
  });

  it("ignore un taux posé ou changé : ce n'est pas un effacement", () => {
    expect(erasedVat({ takeaway: "tva_55" }, { takeaway: "tva_20", b2b: "tva_20" })).toEqual({});
  });

  it("range les contextes dans l'ordre des faits de TVA voisins", () => {
    const erased = erasedVat({ takeaway: "tva_55", b2b: "tva_20", eatIn: "tva_10" }, {});

    expect(Object.keys(erased)).toEqual(["b2b", "eatIn", "takeaway"]);
  });
});

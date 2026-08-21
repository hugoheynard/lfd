import { tvaHandleOf } from "../tva-handle.js";

/**
 * La dérivation a quitté le référentiel fiscal (`TvaPercent.tag`, colonne
 * `tva_rate.tag`) pour ce fichier : un handle de collection est du
 * vocabulaire Shopify. Le résultat, lui, ne change pas — les collections déjà
 * créées gardent leur handle.
 */
describe("tvaHandleOf", () => {
  it("remplace le point décimal par un tiret", () => {
    expect(tvaHandleOf(5.5)).toBe("tva-5-5");
  });

  it("n’invente pas de décimale sur un entier", () => {
    expect(tvaHandleOf(10)).toBe("tva-10");
    expect(tvaHandleOf(20)).toBe("tva-20");
  });
});

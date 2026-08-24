import { vatCollectionHandle } from "../vat-handle.js";

/**
 * La dérivation a quitté le référentiel fiscal (`VatPercent.tag`, colonne
 * `tva_rate.tag`) pour ce fichier : un handle de collection est du
 * vocabulaire Shopify. Le résultat, lui, ne change pas — les collections déjà
 * créées gardent leur handle.
 */
describe("vatCollectionHandle", () => {
  it("remplace le point décimal par un tiret", () => {
    expect(vatCollectionHandle(5.5)).toBe("tva-5-5");
  });

  it("n’invente pas de décimale sur un entier", () => {
    expect(vatCollectionHandle(10)).toBe("tva-10");
    expect(vatCollectionHandle(20)).toBe("tva-20");
  });
});

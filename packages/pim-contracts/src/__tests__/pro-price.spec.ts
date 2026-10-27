import { proPriceOf } from "../pro-price.js";

/**
 * **L'unique porte du prix professionnel** — toujours saisi depuis le lot R3
 * (`documentation/pricing/plan-retirer-le-rapport-pro.md`, 2026-10-27).
 */
describe("le prix professionnel saisi", () => {
  it("sert le HT saisi au millicentime, et en déduit le TTC au centime", () => {
    // 8,53081 € HT × 1,055 = 9,0000045… € → 900 c.
    expect(proPriceOf(5.5, 853_081)).toEqual({ htMillicents: 853_081, ttcCents: 900 });
    // 1,00001 € HT × 1,20 = 1,200012 € → 120 c ; le HT reste celui saisi.
    expect(proPriceOf(20, 100_001)).toEqual({ htMillicents: 100_001, ttcCents: 120 });
  });

  /** Un prix pro absent n'est ni le prix public, ni zéro. */
  it("ne produit rien sans saisie", () => {
    expect(proPriceOf(5.5, null)).toBeNull();
  });

  /**
   * Le taux de l'article est EXIGÉ : il sert à facturer. C'est ce `null` que
   * les faits du catalogue traduisent en `variant_sans_taux`.
   */
  it("ne produit rien sans le taux de l'article", () => {
    expect(proPriceOf(null, 853_081)).toBeNull();
  });

  it("garde un prix pro saisi à zéro : c'est une saisie, pas une absence", () => {
    expect(proPriceOf(5.5, 0)).toEqual({ htMillicents: 0, ttcCents: 0 });
  });
});

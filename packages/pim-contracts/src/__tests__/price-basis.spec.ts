import { htFromTtc, htPriceOf, ttcFromHt } from "../price-basis.js";

describe("htFromTtc", () => {
  it("déduit le hors taxe d'un prix d'étiquette", () => {
    // 1,20 € TTC à 5,5 % → 1,137… €, donc 1,14 € une fois arrondi.
    expect(htFromTtc(120, 5.5)).toBe(114);
    expect(htFromTtc(120, 10)).toBe(109);
    expect(htFromTtc(1_200, 20)).toBe(1_000);
  });

  /**
   * **C'est tout l'objet du chantier** : un prix d'étiquette unique, traversé
   * par deux taux, donne deux hors taxe. Le croissant est à 1,20 € qu'on
   * l'emporte ou qu'on le mange en salle.
   */
  it("donne deux HT différents pour un même TTC selon le taux", () => {
    expect(htFromTtc(120, 5.5)).not.toBe(htFromTtc(120, 10));
  });

  /**
   * `5.5 * 100` vaut `550.0000000000001` en binaire, et `4.85 * 100` vaut
   * `484.99999999999994`. Un taux à deux décimales doit passer par l'entier
   * avant de diviser — le référentiel a déjà payé ce piège une fois, dans
   * `VatPercent`.
   */
  it("ne se fait pas piéger par un taux à deux décimales", () => {
    expect(htFromTtc(10_485, 4.85)).toBe(10_000);
  });

  it("laisse un prix inchangé à taux nul", () => {
    expect(htFromTtc(1_234, 0)).toBe(1_234);
  });
});

describe("ttcFromHt", () => {
  it("ajoute la taxe à un prix hors taxe", () => {
    expect(ttcFromHt(1_000, 20)).toBe(1_200);
    expect(ttcFromHt(1_000, 5.5)).toBe(1_055);
  });
});

describe("l'aller-retour", () => {
  /**
   * Le TTC fait foi : c'est l'étiquette. Le HT en est la conséquence, et un
   * centime peut se perdre en chemin — ce qui est le bon sens de la perte. Ce
   * test **documente** l'asymétrie plutôt que de prétendre qu'elle n'existe
   * pas : on ne recalcule jamais une étiquette depuis sa propre déduction.
   */
  it("revient au même TTC sur les cas ronds", () => {
    for (const ttc of [120, 1_200, 250, 999]) {
      expect(ttcFromHt(htFromTtc(ttc, 5.5), 5.5)).toBe(ttc);
    }
  });
});

describe("htPriceOf", () => {
  it("rend un prix hors taxe tel quel, sans avoir besoin d'un taux", () => {
    expect(htPriceOf(200, "ht", null)).toBe(200);
    expect(htPriceOf(200, "ht", 5.5)).toBe(200);
  });

  it("convertit un prix d'étiquette avec le taux donné", () => {
    expect(htPriceOf(120, "ttc", 5.5)).toBe(114);
  });

  /**
   * Refus, pas repli : inventer un taux ferait facturer un montant que personne
   * n'a décidé. Le référentiel a déjà retiré un défaut de ce genre
   * (`DEFAULT_FOOD_VAT_RATE`).
   */
  it("refuse de convertir un prix d'étiquette sans taux", () => {
    expect(htPriceOf(120, "ttc", null)).toBeNull();
  });
});

/**
 * Les tests de la déduction du hors taxe, **partis avec leur code** le
 * 2026-09-21.
 *
 * Ils vivaient dans `@lfd/pim-contracts`, mêlés à ceux des règles comptables et
 * du schéma de tarification. `tax.ts` ayant rejoint `@lfd/money` — un second
 * site en a eu besoin, et deux arrondis ne se dupliquent pas —, ses tests le
 * suivent : un test qui reste derrière son code cesse d'être lancé quand le
 * paquet d'origine se vide.
 */
import { htFromTtc, htMillicentsOf } from "../tax.js";

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

describe("htMillicentsOf", () => {
  /**
   * Le cran de précision qui évite qu'une division se paie à la quantité : le
   * hors taxe d'un prix d'étiquette ne tombe presque jamais juste, et
   * l'arrondir au centime ici multiplierait l'erreur par ce qui est commandé.
   */
  it("garde les décimales que la division crée", () => {
    // 1,20 € TTC à 5,5 % → 1,13744… € : 113 744 millicentimes.
    expect(htMillicentsOf(120, 5.5)).toBe(113_744);
  });

  it("reste d'accord avec le centime au moment de l'arrondir", () => {
    for (const ttc of [120, 250, 999, 1_200]) {
      const millicents = htMillicentsOf(ttc, 5.5);
      expect(millicents).not.toBeNull();
      expect(Math.round((millicents ?? 0) / 1_000)).toBe(htFromTtc(ttc, 5.5));
    }
  });

  /**
   * Refus, pas repli : inventer un taux ferait facturer un montant que personne
   * n'a décidé. Le référentiel a déjà retiré un défaut de ce genre
   * (`DEFAULT_FOOD_VAT_RATE`).
   */
  it("refuse de dériver sans taux", () => {
    expect(htMillicentsOf(120, null)).toBeNull();
  });
});

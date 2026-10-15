import { proPriceFromPublic, proPriceOf, type ProPricePolicy } from "../accounting-rules.js";

/** Dix euros TTC public, remise de 10 %. */
const TEN_EUROS = 1000;
const RATIO_90 = 9_000;

const RATIO_TTC: ProPricePolicy = { method: "ratio_ttc", ratioBp: RATIO_90 };

/**
 * **L'unique porte du prix professionnel.**
 *
 * Une seule méthode aujourd'hui, et ce fichier existe quand même : c'est ici
 * qu'une seconde viendra se faire éprouver, et c'est ici qu'on vérifie qu'elle
 * n'a pas déplacé la première en s'ajoutant.
 */
describe("le prix professionnel — ratio TTC pré-remise", () => {
  it("remise le TTC public, puis déduit le HT du taux de l'article", () => {
    const price = proPriceOf(TEN_EUROS, RATIO_TTC, 5.5, null);

    expect(price?.ttcCents).toBe(900);
    // 900 c ÷ 1,055 = 853,081 c, en millicentimes (1 000 par centime).
    expect(price?.htMillicents).toBe(853_081);
  });

  it("rend exactement ce que `proPriceFromPublic` rend seul", () => {
    expect(proPriceOf(TEN_EUROS, RATIO_TTC, 20, null)?.ttcCents).toBe(
      proPriceFromPublic(TEN_EUROS, RATIO_90),
    );
  });

  /**
   * Le taux de l'article est EXIGÉ : le hors taxe n'en est pas dérivable sans
   * lui, et il sert de toute façon à facturer. C'est ce `null` que la
   * projection traduit en `variant_sans_taux`.
   */
  it("ne produit rien sans le taux de l'article", () => {
    expect(proPriceOf(TEN_EUROS, RATIO_TTC, null, null)).toBeNull();
  });

  /**
   * Le hors taxe se déduit du TTC pro **arrondi au centime**, pas d'un
   * rationnel gardé jusqu'au bout : les deux nombres s'affichent l'un sous
   * l'autre, et le second re-taxé doit redonner le premier.
   */
  it("arrondit le prix pro au centime avant de déduire le hors taxe", () => {
    // 1,99 € × 90 % = 1,791 € → 1,79 € pro TTC (arrondi ICI), ÷ 1,055.
    const price = proPriceOf(199, RATIO_TTC, 5.5, null);

    expect(price?.ttcCents).toBe(179);
    expect(price?.htMillicents).toBe(169_668);
  });
});

/** Lot P : la saisie n'entre QUE sous `entered`. */
describe("le prix professionnel — saisi (entered)", () => {
  const ENTERED: ProPricePolicy = { method: "entered", ratioBp: RATIO_90 };

  /**
   * Régression de règle : la saisie était ignorée sous `ratio_ttc`, et la fiche
   * montrait un prix pro tiré du ratio alors qu'un prix avait été saisi (Hugo,
   * 2026-10-15 : « c'est lui qui doit nourrir le tableau »).
   */
  it("fait primer la saisie sous ratio_ttc ; le ratio n'est que le repli", () => {
    expect(proPriceOf(TEN_EUROS, RATIO_TTC, 5.5, 853_081)).toEqual(
      proPriceOf(TEN_EUROS, ENTERED, 5.5, 853_081),
    );
    expect(proPriceOf(TEN_EUROS, RATIO_TTC, 5.5, null)).not.toBeNull();
    expect(proPriceOf(TEN_EUROS, ENTERED, 5.5, null)).toBeNull();
  });

  it("sert le HT saisi au millicentime, et en déduit le TTC au centime", () => {
    // 8,53081 € HT × 1,055 = 9,0000045… € → 900 c.
    expect(proPriceOf(TEN_EUROS, ENTERED, 5.5, 853_081)).toEqual({
      htMillicents: 853_081,
      ttcCents: 900,
    });
    // 1,00001 € HT × 1,20 = 1,200012 € → 120 c ; le HT reste celui saisi.
    expect(proPriceOf(TEN_EUROS, ENTERED, 20, 100_001)).toEqual({
      htMillicents: 100_001,
      ttcCents: 120,
    });
  });

  it("ne dépend pas du prix public", () => {
    expect(proPriceOf(1, ENTERED, 5.5, 500_000)).toEqual(proPriceOf(99_999, ENTERED, 5.5, 500_000));
  });

  it("ne produit rien sans saisie, ni sans taux", () => {
    expect(proPriceOf(TEN_EUROS, ENTERED, 5.5, null)).toBeNull();
    expect(proPriceOf(TEN_EUROS, ENTERED, null, 853_081)).toBeNull();
  });
});

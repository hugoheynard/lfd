import { formatEuros } from "../price-origin/format-euros";

/**
 * `formatEuros` est **la seule règle du paquet qui touche à l'argent**, et deux
 * écrans qui l'écriraient différemment afficheraient deux prix pour la même
 * valeur. C'est donc elle qu'on épingle.
 *
 * ⚠️ **Les espaces d'`Intl` ne sont pas des espaces ordinaires**, et ils ont
 * DÉJÀ changé : les versions récentes d'ICU séparent le montant du `€` par une
 * espace fine insécable (U+202F) là où les anciennes posaient une insécable
 * classique (U+00A0). Une assertion qui recopie la sortie telle quelle passe
 * ici et casse sur un runner à l'ICU différente — un rouge qui ne dit rien du
 * code.
 *
 * On normalise donc toute espace Unicode avant de comparer : le test pin la
 * RÈGLE — virgule décimale, deux décimales, groupement des milliers, symbole
 * après — sans épingler un détail d'implémentation d'ICU.
 */
const normalise = (value: string): string => value.replace(/\p{White_Space}/gu, " ");

describe("formatEuros", () => {
  it("rend des centimes en euros, à la française", () => {
    expect(normalise(formatEuros(1234))).toBe("12,34 €");
  });

  it("garde les deux décimales, y compris à zéro", () => {
    // `0 €` laisserait croire à une absence de prix plutôt qu'à un prix nul.
    expect(normalise(formatEuros(0))).toBe("0,00 €");
    expect(normalise(formatEuros(5))).toBe("0,05 €");
  });

  it("groupe les milliers", () => {
    expect(normalise(formatEuros(199900))).toBe("1 999,00 €");
  });

  it("porte le signe des montants négatifs", () => {
    // Un avoir ou une remise descend sous zéro ; l'afficher sans signe
    // transformerait un remboursement en facturation.
    expect(normalise(formatEuros(-250))).toBe("-2,50 €");
  });

  it("divise par cent, et ne tronque pas", () => {
    // Le contrat d'entrée est en CENTIMES. Un appelant qui passerait des euros
    // afficherait des montants cent fois trop petits — ce test est le rappel.
    expect(normalise(formatEuros(1))).toBe("0,01 €");
    expect(normalise(formatEuros(100))).toBe("1,00 €");
  });
});

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
  it("rend des millicentimes en euros, à la française", () => {
    expect(normalise(formatEuros(1_234_000))).toBe("12,34 €");
  });

  it("garde les deux décimales, y compris à zéro", () => {
    // `0 €` laisserait croire à une absence de prix plutôt qu'à un prix nul.
    expect(normalise(formatEuros(0))).toBe("0,00 €");
    expect(normalise(formatEuros(5_000))).toBe("0,05 €");
  });

  it("groupe les milliers", () => {
    expect(normalise(formatEuros(199_900_000))).toBe("1 999,00 €");
  });

  it("porte le signe des montants négatifs", () => {
    // Un avoir ou une remise descend sous zéro ; l'afficher sans signe
    // transformerait un remboursement en facturation.
    expect(normalise(formatEuros(-250_000))).toBe("-2,50 €");
  });

  it("divise par cent mille, et ne tronque pas", () => {
    // Le contrat d'entrée est en MILLICENTIMES. Un appelant qui passerait des
    // centimes afficherait des montants mille fois trop petits — ce test est
    // le rappel, et c'est le genre d'erreur qu'on ne voit qu'en production.
    expect(normalise(formatEuros(1_000))).toBe("0,01 €");
    expect(normalise(formatEuros(100_000))).toBe("1,00 €");
  });

  /**
   * **Les décimales au-delà du centime ne s'affichent que si elles existent.**
   *
   * Un hors taxe déduit d'un prix d'étiquette en porte (8,18182 €), un prix
   * rond n'en porte pas. Les afficher toujours ferait passer chaque prix posé
   * pour un prix calculé.
   */
  it("montre les décimales fines quand il y en a, et pas sinon", () => {
    expect(normalise(formatEuros(818_182))).toBe("8,18182 €");
    expect(normalise(formatEuros(210_000))).toBe("2,10 €");
  });
});

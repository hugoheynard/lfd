import { fromCents, roundToCents, type Exact } from "./exact.js";

/**
 * **Le millicentime** — un millième de centime, soit 10⁻⁵ euro.
 *
 * ## Pourquoi une unité de plus
 *
 * Un prix hors taxe déduit d'un prix d'étiquette n'existe presque jamais en
 * centimes entiers : 9,00 € TTC à 10 % valent 8,181818… € HT. Arrondir au
 * centime jette 0,18 millicentime par article — invisible à l'unité, visible
 * dès la troisième : douze articles facturent 107,98 € là où douze fois 9,00 €
 * en font 108,00.
 *
 * Le millicentime repousse ce premier écart de 3 articles à 250. Chaque
 * décimale supplémentaire le multiplie par dix — et c'est la **dernière** qui
 * tienne dans un entier Postgres : à 10⁻⁵ € le plafond est de 21 474 €, à 10⁻⁸
 * il tomberait à 21 €, ce qui obligerait toutes les colonnes d'argent à passer
 * en `BigInt`. C'est ce plafond qui a arrêté le curseur ici, pas une préférence.
 *
 * ## Ce qui est en millicentimes, et ce qui ne l'est pas
 *
 * Seuls les prix **UNITAIRES DÉRIVÉS** — ceux qu'une quantité multiplie. Un
 * prix qu'un humain pose (une mercuriale, un plancher, un tarif de catalogue)
 * reste en centimes : personne ne saisit 2,10345 €, et lui donner trois
 * décimales muettes inviterait à croire qu'on peut.
 *
 * Les TOTAUX restent en centimes eux aussi : ce sont des montants réellement
 * échangés. L'arrondi a lieu **une fois**, au total de ligne — c'est
 * exactement ce qui répare l'écart.
 */
export const MILLICENTS_PER_CENT = 1_000;

/** Un montant en millicentimes, exact. */
export function fromMillicents(millicents: number): Exact {
  return { num: BigInt(Math.trunc(millicents)), den: BigInt(MILLICENTS_PER_CENT) };
}

/**
 * L'arrondi au millicentime — même règle que {@link roundToCents}, un cran plus
 * bas : au plus proche, la moitié s'éloignant de zéro.
 */
export function roundToMillicents(value: Exact): number {
  return roundToCents({ num: value.num * BigInt(MILLICENTS_PER_CENT), den: value.den });
}

/**
 * Un prix posé en centimes vers son équivalent en millicentimes.
 *
 * **Exact, sans arrondi possible** : multiplier par mille ne perd rien. C'est le
 * sens dans lequel on peut traverser sans y penser — l'autre, non.
 */
export function millicentsFromCents(cents: number): number {
  return cents * MILLICENTS_PER_CENT;
}

/**
 * Un montant en millicentimes vers le centime — **avec perte assumée**.
 *
 * À n'appeler qu'au bout de la chaîne, sur un montant réellement échangé : un
 * total de ligne, une facture. L'appeler sur un prix unitaire au milieu du
 * trajet rejetterait précisément la précision qu'on a introduite pour lui.
 */
export function centsFromMillicents(millicents: number): number {
  return roundToCents(fromMillicents(millicents));
}

/**
 * Le **total d'une ligne**, en centimes : un prix unitaire en millicentimes,
 * une quantité, **un seul arrondi**.
 *
 * C'est la fonction qui répare l'écart, et elle tient en une ligne. Ce qui
 * comptait n'était pas de calculer autrement mais de n'arrondir qu'ici —
 * arrondir le prix unitaire d'abord, puis multiplier, c'est multiplier
 * l'erreur par la quantité.
 */
export function lineTotalCents(unitMillicents: number, quantity: number): number {
  return roundToCents({
    num: BigInt(Math.trunc(unitMillicents)) * BigInt(Math.trunc(quantity)),
    den: BigInt(MILLICENTS_PER_CENT),
  });
}

/** Le prix unitaire en centimes, tel qu'un écran l'affiche. Indicatif. */
export function unitPriceCents(unitMillicents: number): number {
  return centsFromMillicents(unitMillicents);
}

/** Rend un montant en centimes depuis un exact — réexporté pour la symétrie. */
export { fromCents, roundToCents };

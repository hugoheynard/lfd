const CENTS_PER_EURO = 100;
const MILLICENTS_PER_EURO = 100_000;

/**
 * **Des centimes en euros** pour la Direction, qui lit des euros : l'entier
 * divisé par cent, un nombre à deux décimales au plus. La division d'un
 * entier par 100 rend le double le plus proche du décimal, et JSON l'écrit
 * à l'identique (`1234` → `12.34`). On n'additionne jamais ce nombre : les
 * sommes se font en centimes, puis se convertissent.
 */
export function eurosOfCents(cents: number): number {
  return cents / CENTS_PER_EURO;
}

/** {@link eurosOfCents}, en gardant `null` : une donnée absente n'est jamais un zéro. */
export function eurosOfNullableCents(cents: number | null): number | null {
  return cents === null ? null : eurosOfCents(cents);
}

/**
 * **Un prix unitaire en millicentimes, en euros** — cinq décimales au plus.
 * Le prix unitaire est stocké au millicentime (10⁻⁵ €) parce qu'un arrondi
 * au centime par article se voit dès quelques articles (`@lfd/money`,
 * `millicents.ts`) : l'arrondir à deux décimales ici servirait un prix que
 * la commande n'a pas appliqué. Cinq décimales est la précision exacte de la
 * colonne, ni plus ni moins (`1_234_567` → `12.34567`).
 */
export function eurosOfMillicents(millicents: number): number {
  return millicents / MILLICENTS_PER_EURO;
}

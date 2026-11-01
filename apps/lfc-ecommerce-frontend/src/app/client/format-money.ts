/**
 * **Comment un montant s'écrit à l'écran** — et rien d'autre.
 *
 * Sorti de `cart-total.ts` quand le panier a pris son dossier : douze des quinze
 * fichiers qui importaient ce module ne voulaient que ces deux fonctions, et
 * aucun n'a de panier. Une facture, un historique de commandes et une vignette
 * de rayon traversaient un module nommé « total du panier » pour formater un
 * prix — le nom mentait sur ce qui dépendait de quoi, et un dossier `cart/`
 * aurait rendu le mensonge structurel.
 */

/** Un prix en euros → « 5,50 € ». La virgule est décimale, ici. */
export function formatEuro(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} €`;
}

/**
 * Un montant en **centimes** → « 5,50 € ».
 *
 * C'est la forme qui compte désormais : le serveur facture en centimes entiers,
 * et le front les affiche sans jamais repasser par un flottant. `formatEuro`
 * reste pour ce qui n'a pas encore de source serveur — une facture de maquette,
 * un relevé — et disparaîtra avec elle.
 */
export function formatCents(cents: number): string {
  return formatEuro(cents / 100);
}

/** Un taux → « 5,5 % ». Le taux entier ne traîne pas de décimale inutile. */
export function formatRate(rate: number): string {
  return `${String(rate).replace('.', ',')} %`;
}

const MILLICENTS_PER_EURO = 100_000;
const MILLICENT_DIGITS = 5;
const CENT_DIGITS = 2;

/**
 * Un prix unitaire en **millicentimes** → « 0,8184 € » : deux décimales au
 * moins, cinq au plus, zéros de queue retirés au-delà des centimes. Entiers
 * seulement, aucun flottant.
 *
 * C'est le prix HT d'un pro tel qu'il est calculé (plan
 * `documentation/promotions/plan-remise-par-ligne.md`, § 18.6 — option (b),
 * décision de Hugo du 2026-11-01) : 5 × 0,8184 € = 4,092 € → 4,09 €, la ligne
 * du panier. Arrondi au centime (0,82 €), la multiplication ne tombait pas juste.
 */
export function formatMillicents(millicents: number): string {
  const sign = millicents < 0 ? '−' : '';
  const absolute = Math.abs(millicents);
  const whole = Math.floor(absolute / MILLICENTS_PER_EURO);
  let fraction = String(absolute % MILLICENTS_PER_EURO).padStart(MILLICENT_DIGITS, '0');
  while (fraction.length > CENT_DIGITS && fraction.endsWith('0')) {
    fraction = fraction.slice(0, -1);
  }
  return `${sign}${String(whole)},${fraction} €`;
}

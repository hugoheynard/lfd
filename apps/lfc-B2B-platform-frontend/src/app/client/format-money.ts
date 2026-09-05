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

/** Un taux → « 5,5 % ». Le taux entier ne traîne pas de décimale inutile. */
export function formatRate(rate: number): string {
  return `${String(rate).replace('.', ',')} %`;
}

/**
 * Ce qui reste des canaux côté écran : l'affichage d'un taux.
 *
 * Ce fichier portait aussi la matrice des canaux — les paires (point de vente,
 * contexte), leur résolution par fiche et par famille, et les cases de
 * l'éditeur. Elle est partie en X4
 * (`documentation/catalogue/plan-sans-interrupteurs.md`) ; les contextes de
 * vente et leur TVA restent.
 */

/** `5.5` → « 5,5 % » ; `10` → « 10 % ». Affichage FR. */
export function formatPercent(percent: number): string {
  return `${percent.toString().replace('.', ',')} %`;
}

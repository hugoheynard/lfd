import type { OrderLineView } from '@lfd/contracts';

/**
 * **La trace du prix, telle qu'une ligne de commande la porte.**
 *
 * Des fonctions pures, à part du composant : dériver « quel était le tarif
 * d'entrée » est de l'arithmétique de lecture, et l'arithmétique se teste sans
 * monter un gabarit.
 *
 * Rien ici ne CALCULE un prix. La résolution a eu lieu à la passation, côté
 * serveur, et son résultat est figé sur la ligne : ce module ne fait que relire
 * ce qui y est écrit. Recalculer quoi que ce soit ici donnerait une seconde
 * version de la vérité, et celle qu'on regarderait le moins finirait par
 * contredire la facture.
 */

/**
 * Le tarif **d'entrée** de la ligne, s'il diffère de ce qui a été facturé.
 *
 * `null` dans deux cas qu'il ne faut pas confondre à l'écran, mais qui se
 * traitent pareil — il n'y a rien à barrer :
 *
 * - aucune règle n'a joué, donc le prix affiché EST le tarif d'entrée ;
 * - la ligne ne porte aucune trace : une commande antérieure au gel de la trace,
 *   ou une ligne fabriquée par un import. L'absence est rendue telle quelle
 *   plutôt qu'inventée.
 */
export function entryPriceOf(line: OrderLineView): number | null {
  const base = line.pricing?.basePriceMillicents ?? null;
  return base === null || base === line.unitPriceMillicents ? null : base;
}

/**
 * Les libellés des étages qui ont produit un effet, dans l'ordre.
 *
 * Le libellé est **destiné au client** — c'est ce que le contrat en dit, et
 * c'est pour ça qu'il peut s'afficher des deux côtés sans porte à poser. Une
 * ligne sans trace n'a rien à dire, et rend une liste vide plutôt qu'une phrase
 * inventée.
 */
export function priceStepLabels(line: OrderLineView): readonly string[] {
  return (line.pricing?.steps ?? []).map((step) => step.label);
}

/**
 * Le prix a-t-il été **relevé** par une limite ?
 *
 * C'est le signe qu'une règle n'a pas produit son effet — et c'est exactement ce
 * qu'un client remarque avant nous.
 */
export function wasFloored(line: OrderLineView): boolean {
  return line.pricing?.floored ?? false;
}

import type { FoldPanelSide } from 'fold-ng';

/**
 * Le pli de l'écran, en requête : le même seuil que les feuilles de style de
 * l'app cliente et que le rail de `fold-well` (`scrollable="narrow"`). Aucune
 * autre constante TypeScript ne le porte (vérifié le 2026-09-14) : le CSS
 * l'écrit seul partout ailleurs.
 */
export const NARROW_QUERY = '(max-width: 899.98px)';

/**
 * Le côté d'où monte un panneau fold : **le bas en pile, la droite au-delà**.
 *
 * Lu AU CLIC, jamais en signal : ouvrir un panneau est un geste, donc toujours
 * dans le navigateur, et la largeur qui compte est celle du moment où l'on
 * ouvre. C'est aussi ce qui laisse le rendu serveur hors de la question.
 */
export function panelSide(): FoldPanelSide {
  return matchMedia(NARROW_QUERY).matches ? 'bottom' : 'right';
}

/**
 * Le côté d'un **dialogue** fold : **le bas en pile, le centre au-delà**.
 *
 * Deux fonctions et non une option, parce que ce sont deux natures. Un panneau
 * travaille À CÔTÉ de la page — la liste d'adresses reste lisible pendant qu'on
 * la parcourt. Un dialogue l'INTERROMPT : une adresse de livraison se saisit
 * d'un bloc, créneaux et contact compris, et `center` pose le voile, le piège
 * de focus et Échap (fold-ng 0.27.2). En pile, un dialogue centré serait une
 * boîte serrée au milieu d'un téléphone : la feuille du bas reste la forme
 * native, pouce à portée du pied.
 *
 * Lu AU CLIC, comme {@link panelSide}.
 */
export function dialogSide(): FoldPanelSide {
  return matchMedia(NARROW_QUERY).matches ? 'bottom' : 'center';
}

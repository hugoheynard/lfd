/**
 * **Glisser d'une rangée à l'autre**, au doigt, sur la vue des portes.
 *
 * Fonctions pures : le composant ne fait que mesurer le geste. Glisser vers
 * la gauche avance vers les portes, comme le sélecteur, rangé du fond (à
 * gauche) aux portes (à droite).
 */

/** Un glissement plus court ne change pas de rangée : c'est un toucher qui a bougé. */
export const SWIPE_MIN_PX = 60;

/**
 * Un geste plus vertical qu'horizontal est un défilement de page, pas un
 * changement de rangée : il faut au moins ce rapport entre les deux.
 */
const SWIPE_HORIZONTAL_RATIO = 1.5;

/** Le pas d'un geste : +1 vers les portes, −1 vers le fond, 0 rien. */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_HORIZONTAL_RATIO) {
    return 0;
  }
  return dx < 0 ? 1 : -1;
}

/** La rangée d'à côté, ou `null` au bout : on ne boucle pas, le fond n'est pas à côté des portes. */
export function neighbourRow(
  rows: readonly number[],
  current: number | null,
  step: -1 | 0 | 1,
): number | null {
  if (step === 0 || current === null) {
    return null;
  }
  const at = rows.indexOf(current);
  if (at === -1) {
    return null;
  }
  return rows[at + step] ?? null;
}

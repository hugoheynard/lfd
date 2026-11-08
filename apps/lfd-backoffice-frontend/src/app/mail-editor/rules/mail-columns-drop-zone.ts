/** Un point du pointeur, en coordonnées de la fenêtre (`clientX`, `clientY`). */
export interface PointerPoint {
  readonly x: number;
  readonly y: number;
}

/** La boîte d'une mise en page de colonnes à l'écran (`getBoundingClientRect`). */
export interface LayoutBox {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * **Le pointeur vise-t-il une mise en page de colonnes ?** (constaté par Hugo
 * le 2026-11-08 : « je n'arrive pas à dropper dans la zone cible »).
 *
 * Tant que c'est vrai, le fil ne trie pas et ne reçoit pas : sinon il pose sa
 * place de dépôt — haute comme le bloc — au-dessus de la mise en page, qui
 * descend sous le pointeur, et la cellule visée s'enfuit. C'est la cellule
 * sous le pointeur qui reçoit. Hors de la boîte (au-dessus, au-dessous), le
 * fil reprend son tri, pour poser un bloc avant ou après la mise en page.
 *
 * Bords compris, gouttières comprises : la boîte est celle de toute la mise
 * en page. Sans pointeur connu (le glisser vient de commencer), la réponse
 * est non — le fil reste une destination.
 */
export function pointerOverColumns(
  pointer: PointerPoint | null,
  layouts: readonly LayoutBox[],
): boolean {
  if (pointer === null) {
    return false;
  }
  return layouts.some(
    (box) =>
      pointer.x >= box.left &&
      pointer.x <= box.right &&
      pointer.y >= box.top &&
      pointer.y <= box.bottom,
  );
}

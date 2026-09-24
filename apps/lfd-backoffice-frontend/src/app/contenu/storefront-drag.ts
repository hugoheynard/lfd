import { signal } from '@angular/core';

import type { Cell, StorefrontShape } from '@lfd/storefront-layout';

import type { StorefrontTemplate } from './storefront-templates';

/** En deçà, un appui suivi d'un lâcher est un clic, pas un glisser. */
const DRAG_THRESHOLD_PX = 4;

/** Ce qu'on tire : une forme de la palette, un gabarit, ou un objet posé. */
export interface DragSource {
  readonly format: StorefrontShape;
  /** Le gabarit tiré de la palette, s'il y en a un : l'objet posé en sera une copie. */
  readonly template: StorefrontTemplate | null;
  /** L'objet déplacé ; `null` pour un objet tiré de la palette. */
  readonly blockId: string | null;
}

/** Ce que le geste lit d'un événement de pointeur — et rien d'autre. */
export type PointerLike = Pick<PointerEvent, 'button' | 'clientX' | 'clientY' | 'preventDefault'>;

/** Un glisser en cours. */
export interface Drag extends DragSource {
  /** Décalage, en cases, entre l'origine de l'objet et la case saisie. */
  readonly grab: Cell;
  readonly startX: number;
  readonly startY: number;
  readonly moved: boolean;
  /** La case visée (origine de l'objet), ou `null` hors de la grille. */
  readonly target: Cell | null;
}

/**
 * Le geste de glisser de l'éditeur « Vitrine », en pointer events (souris ET
 * tactile) — sans dépendance. Il suit le pointeur et traduit la case sous lui
 * en ORIGINE de l'objet ; il ne décide rien : poser, refuser, sélectionner
 * reste l'affaire de l'éditeur, qui reçoit le geste fini.
 */
export class PointerDrag {
  readonly state = signal<Drag | null>(null);

  start(event: PointerLike, source: DragSource, grab: Cell): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    this.state.set({
      ...source,
      grab,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      target: null,
    });
  }

  /** `cell` : la case sous le pointeur, `null` hors de la grille. */
  move(event: PointerLike, cell: Cell | null): void {
    const drag = this.state();
    if (drag === null) {
      return;
    }
    const moved =
      drag.moved ||
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > DRAG_THRESHOLD_PX;
    this.state.set({ ...drag, moved, target: originOf(drag, cell) });
  }

  /** Clôt le geste et le rend, avec l'origine visée au lâcher (`null` hors de la grille). */
  finish(cell: Cell | null): { readonly drag: Drag; readonly origin: Cell | null } | null {
    const drag = this.state();
    if (drag === null) {
      return null;
    }
    this.state.set(null);
    return { drag, origin: originOf(drag, cell) };
  }

  cancel(): void {
    this.state.set(null);
  }
}

function originOf(drag: Drag, cell: Cell | null): Cell | null {
  return cell === null
    ? null
    : { column: cell.column - drag.grab.column, row: cell.row - drag.grab.row };
}

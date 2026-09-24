/**
 * La géométrie du pointeur sur la grille de l'éditeur « Vitrine » — pure :
 * la boîte et le point viennent de l'appelant.
 */

import { type Cell, GRID_COLUMNS } from './storefront-grid';

export interface GridBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * La case sous un point de l'écran — l'aimantation. Hors de la grille : `null`.
 * Le bord droit/bas appartient à la dernière case, pas au-delà.
 */
export function cellAtPoint(box: GridBox, rows: number, x: number, y: number): Cell | null {
  if (box.width <= 0 || box.height <= 0) {
    return null;
  }
  const relX = x - box.left;
  const relY = y - box.top;
  if (relX < 0 || relY < 0 || relX > box.width || relY > box.height) {
    return null;
  }
  return {
    column: Math.min(GRID_COLUMNS, Math.floor((relX / box.width) * GRID_COLUMNS) + 1),
    row: Math.min(rows, Math.floor((relY / box.height) * rows) + 1),
  };
}

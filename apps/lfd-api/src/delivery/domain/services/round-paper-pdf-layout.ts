import {
  type Doc,
  LEFT,
  MARGIN_Y,
  MM,
  PAGE_HEIGHT,
  WIDTH,
} from "../../../platform/pdf/paper-pdf-kit.js";

/** Sous cette ligne, on tourne la page : le pied garde sa place. */
export const BOTTOM = PAGE_HEIGHT - MARGIN_Y - 8 * MM;
/** La colonne de la pastille, à gauche de chaque arrêt. */
export const RAIL = 17 * MM;
export const CONTENT_X = LEFT + RAIL;
export const CONTENT_WIDTH = WIDTH - RAIL;
/** Le gris de la hiérarchie : référence, libellés, arrêt annulé. */
export const MUTED = "#6b6b6b";
/** Le fond des encadrés légers. */
export const SOFT = "#ededed";

/** Le curseur vertical, porté d'un arrêt à l'autre et d'une page à l'autre. */
export interface Cursor {
  y: number;
}

/**
 * Une rangée d'un bloc : sa hauteur est connue AVANT d'être posée, ce qui
 * permet de décider d'un bloc entier s'il tient sur la page.
 */
export interface Row {
  readonly height: number;
  readonly draw: (doc: Doc, y: number) => void;
}

/** Une rangée d'espace. */
export function gap(height: number): Row {
  return { height, draw: () => undefined };
}

export function newPage(doc: Doc, cursor: Cursor): void {
  doc.addPage();
  cursor.y = MARGIN_Y;
}

/** Un bloc : ses rangées, ce qui se dessine dans sa marge, et sa reprise. */
export interface Block {
  readonly rows: readonly Row[];
  /** La hauteur minimale que demande la marge (pastille, case à cocher). */
  readonly railHeight: number;
  readonly drawRail: (doc: Doc, y: number) => void;
  /** La rangée posée en tête de page quand le bloc dépasse une page entière. */
  readonly continuation: Row;
}

/**
 * Pose un bloc **sans le couper** : s'il ne tient pas dans le reste de la
 * page, il part entier sur la suivante. Seul un bloc plus haut qu'une page
 * entière se coupe, entre deux rangées, et reprend sous « (suite) ».
 */
export function placeBlock(doc: Doc, cursor: Cursor, block: Block): void {
  const height = Math.max(
    block.rows.reduce((sum, row) => sum + row.height, 0),
    block.railHeight,
  );
  const fitsHere = cursor.y + height <= BOTTOM;
  const fitsAPage = height <= BOTTOM - MARGIN_Y;
  // Un bloc plus haut qu'une page commence où l'on est, s'il y a la place
  // de sa marge : le renvoyer à la page suivante ne l'empêcherait pas d'être coupé.
  const roomForHead = cursor.y + block.railHeight <= BOTTOM;
  if (!fitsHere && (fitsAPage || !roomForHead) && cursor.y > MARGIN_Y) {
    newPage(doc, cursor);
  }
  const top = cursor.y;
  block.drawRail(doc, top);
  for (const row of block.rows) {
    if (cursor.y + row.height > BOTTOM && cursor.y > MARGIN_Y) {
      newPage(doc, cursor);
      block.continuation.draw(doc, cursor.y);
      cursor.y += block.continuation.height;
    }
    row.draw(doc, cursor.y);
    cursor.y += row.height;
  }
  cursor.y = Math.max(cursor.y, top + block.railHeight);
}

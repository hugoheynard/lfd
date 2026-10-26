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

/**
 * Le curseur vertical, porté d'un arrêt à l'autre et d'une page à l'autre,
 * avec les bornes de la page : celles de la feuille seule par défaut, celles
 * du cadre quand la feuille est une section du dossier des tournées.
 */
export interface Cursor {
  y: number;
  /** Où une page neuve commence. */
  readonly top: number;
  /** Sous cette ligne, on tourne la page. */
  readonly bottom: number;
}

/** Le curseur d'une feuille imprimée seule, en haut de sa première page. */
export function sheetCursor(): Cursor {
  return { y: MARGIN_Y, top: MARGIN_Y, bottom: BOTTOM };
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
  cursor.y = cursor.top;
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
  const fitsHere = cursor.y + height <= cursor.bottom;
  const fitsAPage = height <= cursor.bottom - cursor.top;
  // Un bloc plus haut qu'une page commence où l'on est, s'il y a la place
  // de sa marge : le renvoyer à la page suivante ne l'empêcherait pas d'être coupé.
  const roomForHead = cursor.y + block.railHeight <= cursor.bottom;
  if (!fitsHere && (fitsAPage || !roomForHead) && cursor.y > cursor.top) {
    newPage(doc, cursor);
  }
  const top = cursor.y;
  block.drawRail(doc, top);
  for (const row of block.rows) {
    if (cursor.y + row.height > cursor.bottom && cursor.y > cursor.top) {
      newPage(doc, cursor);
      block.continuation.draw(doc, cursor.y);
      cursor.y += block.continuation.height;
    }
    row.draw(doc, cursor.y);
    cursor.y += row.height;
  }
  cursor.y = Math.max(cursor.y, top + block.railHeight);
}

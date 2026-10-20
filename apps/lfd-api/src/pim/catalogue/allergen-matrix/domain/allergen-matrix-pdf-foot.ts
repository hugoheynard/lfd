import type { AllergenMatrixWording } from "@lfd/pim-contracts";

import { type Doc, MARGIN_Y, put, putRight } from "../../../../platform/pdf/paper-pdf-kit.js";
import type { MatrixColumn } from "./allergen-matrix.js";
import { SHEET_HEIGHT, SHEET_LEFT, SHEET_RIGHT } from "./allergen-matrix-pdf-grid.js";
import { drawMark } from "./allergen-matrix-pdf-marks.js";
import { fill, localDateTime } from "./allergen-matrix-pdf-words.js";

/** La place réservée au pied : légende, noms réglementaires, phrase datée et folio. */
export const FOOT_HEIGHT = 42;

const LEGEND_SIZE = 7.5;
const GAP = 14;
const RADIUS = 3;

/**
 * La légende ouvre chaque mot par une capitale (Hugo, 2026-10-20) : le mot de
 * l'article 21 reste « contient » dans le dictionnaire et dans les cases, la
 * capitale n'est qu'une convention d'affichage de la légende.
 */
function asLegendEntry(word: string): string {
  return word.charAt(0).toLocaleUpperCase() + word.slice(1);
}

/** La légende, sur une ligne : signe ET mot, jamais la couleur seule (plan §1). */
function legend(doc: Doc, wording: AllergenMatrixWording, y: number): void {
  let x = SHEET_LEFT;
  put(doc, wording.document.legend, x, y, { size: LEGEND_SIZE, bold: true });
  x += doc.widthOfString(wording.document.legend) + 8;
  for (const kind of ["contains", "traces"] as const) {
    drawMark(doc, kind, x + RADIUS, y + RADIUS, RADIUS);
    x += 2 * RADIUS + 4;
    const word = asLegendEntry(wording.presence[kind]);
    put(doc, word, x, y, { size: LEGEND_SIZE });
    x += doc.widthOfString(word) + GAP;
  }
  for (const text of [wording.document.legendAbsent, wording.document.legendNotDeclared]) {
    put(doc, text, x, y, { size: LEGEND_SIZE });
    x += doc.widthOfString(text) + GAP;
  }
}

/**
 * Rend chaque nom COURANT d'en-tête à son libellé réglementaire (Hugo,
 * 2026-10-20) : « Gluten : céréales contenant du gluten · … ». Vide quand
 * aucune colonne n'est raccourcie.
 */
export function shortNameNotes(
  columns: readonly MatrixColumn[],
  wording: AllergenMatrixWording,
): string {
  return columns
    .filter((column) => column.header !== column.label)
    .map((column) =>
      fill(wording.document.shortNameNote, {
        name: column.header,
        label:
          column.label.charAt(0).toLocaleLowerCase() +
          column.label.slice(1) +
          (wording.columnNoteSuffixes[column.category] ?? ""),
      }),
    )
    .join(" · ");
}

/**
 * Le pied de CHAQUE page, posé une fois le total connu : la légende, la
 * phrase datée du plan §1 (« Établie à partir des fiches au … ») et le folio.
 * La matrice est un instantané : sa date est sur chaque page (plan §2).
 */
export function drawPageFoot(
  doc: Doc,
  wording: AllergenMatrixWording,
  generatedAt: Date,
  columns: readonly MatrixColumn[],
): void {
  const notes = shortNameNotes(columns, wording);
  const range = doc.bufferedPageRange();
  const footer = fill(wording.document.footer, {
    date: localDateTime(generatedAt, wording.document),
  });
  const bottom = SHEET_HEIGHT - MARGIN_Y;
  for (let index = 0; index < range.count; index++) {
    doc.switchToPage(range.start + index);
    legend(doc, wording, bottom - FOOT_HEIGHT + 6);
    put(doc, notes, SHEET_LEFT, bottom - 21, { size: 7 });
    put(doc, footer, SHEET_LEFT, bottom - 8, { size: 7.5 });
    const folio = fill(wording.document.page, {
      page: String(index + 1),
      count: String(range.count),
    });
    putRight(doc, folio, SHEET_RIGHT, bottom - 8, 7.5);
  }
}

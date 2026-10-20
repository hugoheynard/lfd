import type { AllergenMatrixWording } from "@lfd/pim-contracts";

import { type Doc, MARGIN_Y, put, putRight } from "../../../../platform/pdf/paper-pdf-kit.js";
import { SHEET_HEIGHT, SHEET_LEFT, SHEET_RIGHT } from "./allergen-matrix-pdf-grid.js";
import { drawMark } from "./allergen-matrix-pdf-marks.js";
import { fill, localDateTime } from "./allergen-matrix-pdf-words.js";

/** La place réservée au pied : légende, puis phrase datée et folio. */
export const FOOT_HEIGHT = 30;

const LEGEND_SIZE = 7.5;
const GAP = 14;
const RADIUS = 3;

/** La légende, sur une ligne : signe ET mot, jamais la couleur seule (plan §1). */
function legend(doc: Doc, wording: AllergenMatrixWording, y: number): void {
  let x = SHEET_LEFT;
  put(doc, wording.document.legend, x, y, { size: LEGEND_SIZE, bold: true });
  x += doc.widthOfString(wording.document.legend) + 8;
  for (const kind of ["contains", "traces"] as const) {
    drawMark(doc, kind, x + RADIUS, y + RADIUS, RADIUS);
    x += 2 * RADIUS + 4;
    put(doc, wording.presence[kind], x, y, { size: LEGEND_SIZE });
    x += doc.widthOfString(wording.presence[kind]) + GAP;
  }
  for (const text of [wording.document.legendAbsent, wording.document.legendNotDeclared]) {
    put(doc, text, x, y, { size: LEGEND_SIZE });
    x += doc.widthOfString(text) + GAP;
  }
}

/**
 * Le pied de CHAQUE page, posé une fois le total connu : la légende, la
 * phrase datée du plan §1 (« Établie à partir des fiches au … ») et le folio.
 * La matrice est un instantané : sa date est sur chaque page (plan §2).
 */
export function drawPageFoot(doc: Doc, wording: AllergenMatrixWording, generatedAt: Date): void {
  const range = doc.bufferedPageRange();
  const footer = fill(wording.document.footer, {
    date: localDateTime(generatedAt, wording.document),
  });
  const bottom = SHEET_HEIGHT - MARGIN_Y;
  for (let index = 0; index < range.count; index++) {
    doc.switchToPage(range.start + index);
    legend(doc, wording, bottom - FOOT_HEIGHT + 6);
    put(doc, footer, SHEET_LEFT, bottom - 8, { size: 7.5 });
    const folio = fill(wording.document.page, {
      page: String(index + 1),
      count: String(range.count),
    });
    putRight(doc, folio, SHEET_RIGHT, bottom - 8, 7.5);
  }
}

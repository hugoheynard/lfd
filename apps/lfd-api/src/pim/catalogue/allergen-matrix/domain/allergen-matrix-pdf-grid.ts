import type { AllergenMatrixWording } from "@lfd/pim-contracts";

import {
  BOLD,
  type Doc,
  MARGIN_X,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  put,
  REGULAR,
  ROW_GRAY,
} from "../../../../platform/pdf/paper-pdf-kit.js";
import { fillBox } from "../../../../platform/pdf/paper-pdf-shapes.js";
import type { MatrixColumn, MatrixRow } from "./allergen-matrix.js";
import { drawMark, type MarkKind } from "./allergen-matrix-pdf-marks.js";
import type { MatrixCell, MatrixOthersCell } from "./matrix-row.js";
import { otherAllergenName } from "./other-allergen-name.js";

/** La page A4 en PAYSAGE : la largeur du portrait devient la hauteur. */
export const SHEET_WIDTH = PAGE_HEIGHT;
export const SHEET_HEIGHT = PAGE_WIDTH;
export const SHEET_LEFT = MARGIN_X;
export const SHEET_RIGHT = SHEET_WIDTH - MARGIN_X;

const PRODUCT_WIDTH = 160;
const OTHERS_WIDTH = 105;
/** La hauteur des en-têtes de colonnes, écrits à la verticale. */
export const COLUMN_HEADER_HEIGHT = 84;
const PAD = 3;
const MIN_ROW = 16;
const MARK_RADIUS = 3.2;
const NAME_SIZE = 6;
const GRID = "#C8C8C8";
const ZEBRA = "#F4F4F4";

/** Où commence chaque colonne d'allergène, et sa largeur. */
export interface Grid {
  readonly columns: readonly MatrixColumn[];
  readonly cellWidth: number;
  readonly othersLeft: number;
}

export function gridOf(columns: readonly MatrixColumn[]): Grid {
  const free = SHEET_RIGHT - SHEET_LEFT - PRODUCT_WIDTH - OTHERS_WIDTH;
  const cellWidth = columns.length === 0 ? 0 : free / columns.length;
  return { columns, cellWidth, othersLeft: SHEET_RIGHT - OTHERS_WIDTH };
}

function cellLeft(grid: Grid, index: number): number {
  return SHEET_LEFT + PRODUCT_WIDTH + index * grid.cellWidth;
}

/** Les en-têtes, à la verticale : quatorze mentions tiennent sur une page. */
export function drawColumnHeaders(
  doc: Doc,
  grid: Grid,
  top: number,
  wording: AllergenMatrixWording,
): number {
  const bottom = top + COLUMN_HEADER_HEIGHT;
  put(doc, wording.headers.product, SHEET_LEFT + PAD, bottom - 10, { size: 8, bold: true });
  grid.columns.forEach((column, index) => {
    const size = 7;
    const options = { width: COLUMN_HEADER_HEIGHT - 2 * PAD };
    const height = doc.font(BOLD).fontSize(size).heightOfString(column.label, options);
    const x = cellLeft(grid, index) + Math.max(PAD / 2, (grid.cellWidth - height) / 2);
    doc.save().rotate(-90, { origin: [x, bottom - PAD] });
    doc.text(column.label, x, bottom - PAD, options);
    doc.restore();
  });
  put(doc, wording.headers.others, grid.othersLeft + PAD, bottom - 10, { size: 8, bold: true });
  doc
    .save()
    .rect(SHEET_LEFT, bottom, SHEET_RIGHT - SHEET_LEFT, 1.2)
    .fill("#000000")
    .restore();
  return bottom + 1.2;
}

/** Une ligne de marque : le signe, et ce que l'annexe impose de nommer. */
interface MarkLine {
  readonly kind: MarkKind;
  readonly names: string;
}

function markLines(
  presence: MatrixCell["presence"],
  contains: readonly string[],
  traces: readonly string[],
): MarkLine[] {
  const lines: MarkLine[] = [];
  if (presence === "contains") {
    lines.push({ kind: "contains", names: contains.join(", ") });
  }
  if (traces.length > 0 || presence === "traces") {
    lines.push({ kind: "traces", names: traces.join(", ") });
  }
  return lines;
}

function cellMarkLines(cell: MatrixCell): MarkLine[] {
  return markLines(cell.presence, cell.contains, cell.traces);
}

function othersMarkLines(others: MatrixOthersCell | null): MarkLine[] {
  return others === null
    ? []
    : markLines(
        others.presence,
        others.contains.map(otherAllergenName),
        others.traces.map(otherAllergenName),
      );
}

function namesHeight(doc: Doc, names: string, width: number): number {
  return names === "" ? 0 : doc.font(REGULAR).fontSize(NAME_SIZE).heightOfString(names, { width });
}

/** Dans une case d'allergène : le signe centré, les noms dessous. */
function stackHeight(doc: Doc, lines: readonly MarkLine[], width: number): number {
  return lines.reduce(
    (sum, line) => sum + 2 * MARK_RADIUS + 2 + namesHeight(doc, line.names, width),
    0,
  );
}

function productLines(
  row: MatrixRow,
  wording: AllergenMatrixWording,
): { text: string; size: number; bold: boolean; gray: boolean }[] {
  const lines = [{ text: row.productName, size: 8, bold: true, gray: false }];
  if (row.variantName !== null) {
    lines.push({ text: row.variantName, size: 7.5, bold: false, gray: false });
  }
  lines.push({ text: row.sku, size: 6.5, bold: false, gray: true });
  if (row.state === "to_review") {
    lines.push({ text: wording.states.to_review, size: 7, bold: true, gray: false });
  }
  return lines;
}

const PRODUCT_TEXT_WIDTH = PRODUCT_WIDTH - 2 * PAD;

/** La hauteur d'une ligne de la matrice : sa case la plus haute. */
export function rowHeight(
  doc: Doc,
  grid: Grid,
  row: MatrixRow,
  wording: AllergenMatrixWording,
): number {
  const product = productLines(row, wording).reduce(
    (sum, line) =>
      sum +
      doc
        .font(line.bold ? BOLD : REGULAR)
        .fontSize(line.size)
        .heightOfString(line.text, { width: PRODUCT_TEXT_WIDTH }),
    0,
  );
  const cells = row.cells.map((cell) => stackHeight(doc, cellMarkLines(cell), grid.cellWidth - 2));
  const others = othersMarkLines(row.others).reduce(
    (sum, line) =>
      sum + Math.max(2 * MARK_RADIUS + 2, namesHeight(doc, line.names, OTHERS_WIDTH - 14) + 2),
    0,
  );
  return Math.max(MIN_ROW, product + 2 * PAD, ...cells.map((h) => h + 2 * PAD), others + 2 * PAD);
}

function drawProduct(doc: Doc, row: MatrixRow, top: number, wording: AllergenMatrixWording): void {
  let y = top + PAD;
  for (const line of productLines(row, wording)) {
    put(doc, line.text, SHEET_LEFT + PAD, y, {
      size: line.size,
      bold: line.bold,
      width: PRODUCT_TEXT_WIDTH,
      ...(line.gray ? { color: ROW_GRAY } : {}),
    });
    y += doc
      .font(line.bold ? BOLD : REGULAR)
      .fontSize(line.size)
      .heightOfString(line.text, { width: PRODUCT_TEXT_WIDTH });
  }
}

function drawStack(
  doc: Doc,
  lines: readonly MarkLine[],
  left: number,
  width: number,
  top: number,
): void {
  let y = top + PAD;
  for (const line of lines) {
    drawMark(doc, line.kind, left + width / 2, y + MARK_RADIUS, MARK_RADIUS);
    y += 2 * MARK_RADIUS + 2;
    if (line.names !== "") {
      doc
        .font(REGULAR)
        .fontSize(NAME_SIZE)
        .text(line.names, left + 1, y, { width: width - 2, align: "center" });
      y += namesHeight(doc, line.names, width - 2);
    }
  }
}

function drawOthers(doc: Doc, grid: Grid, others: MatrixOthersCell | null, top: number): void {
  let y = top + PAD;
  for (const line of othersMarkLines(others)) {
    drawMark(
      doc,
      line.kind,
      grid.othersLeft + PAD + MARK_RADIUS,
      y + MARK_RADIUS + 0.5,
      MARK_RADIUS,
    );
    put(doc, line.names, grid.othersLeft + 12, y, {
      size: NAME_SIZE + 0.5,
      width: OTHERS_WIDTH - 14,
    });
    y += Math.max(2 * MARK_RADIUS + 2, namesHeight(doc, line.names, OTHERS_WIDTH - 14) + 2);
  }
}

/** Une ligne « non renseignée » ou « aucun » n'a pas de case : son état les couvre. */
function drawSpanningState(
  doc: Doc,
  grid: Grid,
  row: MatrixRow,
  top: number,
  height: number,
  wording: AllergenMatrixWording,
): void {
  const text = wording.states[row.state];
  const left = cellLeft(grid, 0) + PAD;
  put(doc, text, left, top + height / 2 - 4, { size: 8, bold: row.state === "not_declared" });
}

function drawGridLines(doc: Doc, grid: Grid, top: number, height: number, spanning: boolean): void {
  doc.save().lineWidth(0.4).strokeColor(GRID);
  const edges = spanning
    ? [cellLeft(grid, 0)]
    : [...grid.columns.map((_, index) => cellLeft(grid, index)), grid.othersLeft];
  for (const x of edges) {
    doc
      .moveTo(x, top)
      .lineTo(x, top + height)
      .stroke();
  }
  doc
    .moveTo(SHEET_LEFT, top + height)
    .lineTo(SHEET_RIGHT, top + height)
    .stroke();
  doc.restore();
}

/** Dessine une ligne de la matrice à `top`, sur la hauteur mesurée. */
export function drawRow(
  doc: Doc,
  grid: Grid,
  row: MatrixRow,
  top: number,
  height: number,
  shaded: boolean,
  wording: AllergenMatrixWording,
): void {
  if (shaded) {
    fillBox(doc, { x: SHEET_LEFT, y: top, width: SHEET_RIGHT - SHEET_LEFT, height }, ZEBRA);
  }
  const spanning = row.state === "not_declared" || row.state === "none_declared";
  drawGridLines(doc, grid, top, height, spanning);
  drawProduct(doc, row, top, wording);
  if (spanning) {
    drawSpanningState(doc, grid, row, top, height, wording);
    return;
  }
  row.cells.forEach((cell, index) => {
    drawStack(doc, cellMarkLines(cell), cellLeft(grid, index), grid.cellWidth, top);
  });
  drawOthers(doc, grid, row.others, top);
}

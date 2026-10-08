import type { InvoiceLineInput, InvoiceState } from "../entities/invoice.types.js";
import { type InvoiceSheet, LEFT, MM, MUTED, type TextStyle } from "./invoice-pdf-sheet.js";
import { euros, quantityLabel, unitPrice, vatRateLabel } from "./invoice-pdf-wording.js";

/**
 * **Les lignes de la facture** (E3b) — une par produit, par prix et par taux
 * (D2), telles que la pièce les a figées : désignation et référence,
 * quantité et unité (H87 pièce, KGM kilogramme ; millièmes entiers), prix
 * unitaire HT, taux, montant HT. Rien n'est recalculé.
 *
 * Une page qui déborde rouvre l'en-tête des colonnes : une ligne lue seule
 * en haut d'une page deux doit dire ce que sont ses nombres.
 */

interface Column {
  readonly title: string;
  readonly width: number;
  readonly align: "left" | "right";
  readonly cell: (line: InvoiceLineInput) => string;
}

const COLUMNS: readonly Column[] = [
  { title: "Désignation", width: 215, align: "left", cell: (line) => line.label },
  { title: "Quantité", width: 85, align: "right", cell: quantityLabel },
  {
    title: "Prix unitaire HT",
    width: 80,
    align: "right",
    cell: (line) => unitPrice(line.unitPriceMillicents),
  },
  { title: "TVA", width: 50, align: "right", cell: (line) => vatRateLabel(line.vatRate) },
  { title: "Montant HT", width: 80, align: "right", cell: (line) => euros(line.amountCents) },
];

const GUTTER = 2 * MM;
const HEAD: TextStyle = { size: 8, bold: true, color: MUTED };
const CELL: TextStyle = { size: 9 };
const REFERENCE: TextStyle = { size: 7, color: MUTED };
const ROW_GAP = 1.5 * MM;
/** La hauteur gardée pour l'en-tête des colonnes et une première ligne. */
const HEAD_RESERVE = 12 * MM;

function columnX(index: number): number {
  return LEFT + COLUMNS.slice(0, index).reduce((total, column) => total + column.width, 0);
}

function drawHead(sheet: InvoiceSheet): void {
  const top = sheet.y;
  let height = 0;
  COLUMNS.forEach((column, index) => {
    height = Math.max(
      height,
      sheet.put(column.title, columnX(index), top, {
        ...HEAD,
        width: column.width - GUTTER,
        align: column.align,
      }),
    );
  });
  sheet.rule(top + height + 1);
  sheet.advance(height + ROW_GAP + 1);
}

function rowHeight(sheet: InvoiceSheet, line: InvoiceLineInput): number {
  const [label] = COLUMNS;
  const width = (label?.width ?? 0) - GUTTER;
  return (
    sheet.heightOf(line.label, { ...CELL, width }) +
    sheet.heightOf(`Réf. ${line.sku}`, { ...REFERENCE, width })
  );
}

function drawRow(sheet: InvoiceSheet, line: InvoiceLineInput): void {
  const height = rowHeight(sheet, line);
  if (!sheet.fits(height + ROW_GAP)) {
    sheet.ensure(HEAD_RESERVE + height + ROW_GAP);
    drawHead(sheet);
  }
  const top = sheet.y;
  COLUMNS.forEach((column, index) => {
    const style = { ...CELL, width: column.width - GUTTER, align: column.align };
    const used = sheet.put(column.cell(line), columnX(index), top, style);
    if (index === 0) {
      sheet.put(`Réf. ${line.sku}`, columnX(index), top + used, {
        ...REFERENCE,
        width: style.width,
      });
    }
  });
  sheet.advance(height + ROW_GAP);
}

/** Le tableau des lignes, sur autant de pages qu'il faut. */
export function drawLines(sheet: InvoiceSheet, state: InvoiceState): void {
  sheet.ensure(HEAD_RESERVE * 3);
  drawHead(sheet);
  for (const line of state.lines) {
    drawRow(sheet, line);
  }
  sheet.rule(sheet.y - ROW_GAP / 2);
  sheet.advance(3 * MM);
}

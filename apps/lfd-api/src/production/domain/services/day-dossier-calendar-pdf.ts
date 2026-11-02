import type { CalendarPage, CalendarRow } from "./day-dossier-calendar.js";
import type { MakeRoom } from "./day-dossier-resupplies-pdf.js";
import { figureFontSize, lineFigure } from "./line-tally.js";
import {
  BLACK,
  LEFT,
  MM,
  ROW_GRAY,
  put,
  putCaps,
  type Doc,
} from "../../../platform/pdf/paper-pdf-kit.js";
import { strokeBox } from "../../../platform/pdf/paper-pdf-shapes.js";

/**
 * **Le calendrier du dossier, en PDF** — une page paysage par catégorie
 * racine : les produits en lignes, les tranches horaires en colonnes, la
 * quantité à sortir dans chaque case avec une case à cocher à côté (Hugo,
 * 2026-11-02 : « avec les cases »), le total du produit à droite et celui de
 * chaque tranche en bas.
 *
 * Le papier est tiré à l'arrêt : il ne dit pas ce qui est sorti, il laisse la
 * place de le cocher. La largeur est celle de la page paysage, passée par
 * l'appelant (`contentRightOf`).
 */

const NAME_WIDTH = 62 * MM;
const TOTAL_WIDTH = 24 * MM;
const HEAD_HEIGHT = 10 * MM;
const ROW_HEIGHT = 11 * MM;
const INTERTITLE_HEIGHT = 6.5 * MM;
const FOOT_HEIGHT = 11 * MM;
const CHECK_SIZE = 4.5 * MM;
const FIGURE_SIZE = 15;

/** La géométrie d'une page : où commence chaque colonne de tranche, et leur largeur. */
interface Grid {
  readonly columnX: readonly number[];
  readonly columnWidth: number;
  readonly totalX: number;
  readonly right: number;
}

function gridOf(page: CalendarPage, right: number): Grid {
  const count = Math.max(page.columns.length, 1);
  const free = right - LEFT - NAME_WIDTH - TOTAL_WIDTH;
  // Les tranches se partagent toute la largeur : un calendrier occupe sa page.
  const columnWidth = free / count;
  const first = LEFT + NAME_WIDTH;
  return {
    columnX: page.columns.map((_, index) => first + index * columnWidth),
    columnWidth,
    totalX: first + page.columns.length * columnWidth,
    right: first + page.columns.length * columnWidth + TOTAL_WIDTH,
  };
}

/** Dessine la page d'une catégorie à partir de `top` ; rend le `y` dessous. */
export function drawCalendarPage(
  doc: Doc,
  page: CalendarPage,
  top: number,
  room: MakeRoom,
  right: number,
): number {
  const grid = gridOf(page, right);
  let y = drawHead(doc, page, grid, top);
  /** Tourne la page s'il le faut, et repose l'en-tête des colonnes sur la nouvelle. */
  const ensure = (at: number, needed: number): number => {
    const next = room(at, needed);
    return next < at ? drawHead(doc, page, grid, next) : next;
  };
  for (const row of page.rows) {
    const intertitle = page.intertitles?.get(row.line.sku);
    if (intertitle !== undefined) {
      y = ensure(y, INTERTITLE_HEIGHT + ROW_HEIGHT);
      putCaps(doc, intertitle.toUpperCase(), LEFT + 1 * MM, y + 1.8 * MM);
      y += INTERTITLE_HEIGHT;
    }
    y = ensure(y, ROW_HEIGHT);
    drawRow(doc, row, grid, y);
    y += ROW_HEIGHT;
  }
  y = ensure(y, FOOT_HEIGHT + 8 * MM);
  return drawFoot(doc, page, grid, y);
}

/** Les libellés des colonnes, sur un fond, et le trait épais dessous. */
function drawHead(doc: Doc, page: CalendarPage, grid: Grid, top: number): number {
  doc
    .save()
    .rect(LEFT, top, grid.right - LEFT, HEAD_HEIGHT)
    .fill("#eeeeee")
    .restore();
  putCaps(doc, "PRODUIT", LEFT + 1 * MM, top + 3.5 * MM);
  page.columns.forEach((column, index) => {
    centered(
      doc,
      column.label,
      grid.columnX[index] ?? 0,
      grid.columnWidth,
      top + 3.2 * MM,
      11,
      true,
    );
  });
  centered(doc, "Total", grid.totalX, TOTAL_WIDTH, top + 3.2 * MM, 11, true);
  horizontal(doc, top + HEAD_HEIGHT, grid, 1.5, BLACK);
  verticals(doc, grid, top, HEAD_HEIGHT);
  return top + HEAD_HEIGHT;
}

/** Une ligne : le produit, ses quantités par tranche avec leur case, son total. */
function drawRow(doc: Doc, row: CalendarRow, grid: Grid, top: number): void {
  const nameWidth = NAME_WIDTH - 3 * MM;
  put(doc, row.line.productName, LEFT + 1 * MM, top + (row.mismatch ? 1.8 : 3.4) * MM, {
    size: 11,
    width: nameWidth,
  });
  if (row.mismatch) {
    // Les échéances dépassent le total : la ligne ne répartit rien, et le dit.
    put(doc, "échéances incohérentes — tout « Sans heure »", LEFT + 1 * MM, top + 6.6 * MM, {
      size: 7,
      color: ROW_GRAY,
    });
  }
  row.quantities.forEach((quantity, index) => {
    if (quantity > 0) {
      drawCell(
        doc,
        { quantity, saleUnit: row.line.saleUnit },
        grid.columnX[index] ?? 0,
        grid.columnWidth,
        top,
      );
    }
  });
  const total = { quantity: row.line.quantity, saleUnit: row.line.saleUnit };
  centered(
    doc,
    lineFigure(total),
    grid.totalX,
    TOTAL_WIDTH,
    top + 3 * MM,
    figureFontSize(total, 13),
    true,
  );
  horizontal(doc, top + ROW_HEIGHT, grid, 0.6, ROW_GRAY);
  verticals(doc, grid, top, ROW_HEIGHT);
}

/** La quantité, et la case à cocher à sa droite. */
function drawCell(
  doc: Doc,
  figure: { readonly quantity: number; readonly saleUnit: CalendarRow["line"]["saleUnit"] },
  x: number,
  width: number,
  top: number,
): void {
  const boxX = x + width - CHECK_SIZE - 2.5 * MM;
  centered(
    doc,
    lineFigure(figure),
    x,
    boxX - x,
    top + 2.6 * MM,
    figureFontSize(figure, FIGURE_SIZE),
    true,
  );
  strokeBox(
    doc,
    { x: boxX, y: top + (ROW_HEIGHT - CHECK_SIZE) / 2, width: CHECK_SIZE, height: CHECK_SIZE },
    0.9,
  );
}

/**
 * Le total de chaque tranche, en pièces. Un article au poids n'y entre pas —
 * pièces et grammes ne s'additionnent jamais (P6) — et le papier le dit.
 */
function drawFoot(doc: Doc, page: CalendarPage, grid: Grid, top: number): number {
  const pieceRows = page.rows.filter((row) => row.line.saleUnit === "piece");
  const columnTotals = page.columns.map((_, index) =>
    pieceRows.reduce((sum, row) => sum + (row.quantities[index] ?? 0), 0),
  );
  const total = pieceRows.reduce((sum, row) => sum + row.line.quantity, 0);
  horizontal(doc, top, grid, 1.5, BLACK);
  putCaps(doc, "TOTAL PIÈCES", LEFT + 1 * MM, top + 4 * MM);
  columnTotals.forEach((sum, index) => {
    if (sum > 0) {
      centered(
        doc,
        String(sum),
        grid.columnX[index] ?? 0,
        grid.columnWidth,
        top + 3 * MM,
        14,
        true,
      );
    }
  });
  centered(doc, String(total), grid.totalX, TOTAL_WIDTH, top + 3 * MM, 14, true);
  verticals(doc, grid, top, FOOT_HEIGHT);
  horizontal(doc, top + FOOT_HEIGHT, grid, 0.6, ROW_GRAY);
  let y = top + FOOT_HEIGHT;
  if (pieceRows.length < page.rows.length) {
    put(
      doc,
      "Les articles au poids ne sont pas comptés dans les totaux de pièces.",
      LEFT,
      y + 2 * MM,
      {
        size: 8,
        color: ROW_GRAY,
      },
    );
    y += 6 * MM;
  }
  return y + 4 * MM;
}

function centered(
  doc: Doc,
  text: string,
  x: number,
  width: number,
  y: number,
  size: number,
  bold: boolean,
): void {
  put(doc, text, x, y, { size, bold, width, align: "center" });
}

function horizontal(doc: Doc, y: number, grid: Grid, thickness: number, color: string): void {
  doc
    .save()
    .rect(LEFT, y, grid.right - LEFT, thickness)
    .fill(color)
    .restore();
  doc.fillColor(BLACK);
}

/** Les filets entre les colonnes, et les deux bords : c'est eux qui font le calendrier. */
function verticals(doc: Doc, grid: Grid, top: number, height: number): void {
  doc.save().lineWidth(0.6).strokeColor(ROW_GRAY);
  for (const x of [LEFT, ...grid.columnX, grid.totalX, grid.right]) {
    doc
      .moveTo(x, top)
      .lineTo(x, top + height)
      .stroke();
  }
  doc.restore();
  doc.strokeColor(BLACK);
}

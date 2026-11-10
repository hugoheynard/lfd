import type { Buffer } from "node:buffer";

import type { OrderSummaryTableView } from "@lfd/contracts";

import {
  type Doc,
  LEFT,
  MARGIN_Y,
  MM,
  put,
  putCaps,
  putRight,
  render,
  RIGHT,
  ROW_GRAY,
  rule,
} from "../../../../platform/pdf/paper-pdf-kit.js";
import { money, saleQuantityText } from "./order-sheet-pdf-format.js";
import {
  exclusionLabel,
  type OrderSummaryPaper,
  SUMMARY_TITLE,
  summaryBottomRows,
  TOTAL_LABEL,
} from "./order-summary-paper.js";
import {
  drawSummaryFolios,
  drawSummaryHeader,
  SUMMARY_LIMIT,
  summaryRoom,
} from "./order-summary-pdf-frame.js";
import { drawIncludedOrders } from "./order-summary-pdf-orders.js";

/**
 * **Le récapitulatif de commandes en PDF** (plan
 * `documentation/commandes/boutique/plan-recapitulatif-des-commandes.md`, lot R2) — A4
 * PORTRAIT : quatre colonnes (produit, SKU, quantité, HT) y tiennent, le
 * paysage n'apporterait que du blanc.
 *
 * Pur : il dessine le récapitulatif déjà calculé, sans rien relire ni
 * recalculer. Une table par société, son bas comme une facture, puis le total
 * général, puis les commandes exclues et pourquoi. La pagination est ici : une
 * table coupée reprend son nom et sa barre de titres en haut de la page
 * suivante ; le folio « Page x/N » est posé une fois le total connu.
 */

const COL_HT = 30 * MM;
const COL_QTY = 18 * MM;
const COL_SKU = 32 * MM;
const X_QTY_RIGHT = RIGHT - COL_HT;
const X_SKU_RIGHT = X_QTY_RIGHT - COL_QTY;
const NAME_WIDTH = X_SKU_RIGHT - COL_SKU - LEFT;

const ROW_HEIGHT = 6.5 * MM;
const BOTTOM_ROW_HEIGHT = 5 * MM;
const SECTION_HEAD_SPACE = 22 * MM;
const BOTTOM_BLOCK_LEFT = RIGHT - 80 * MM;

const LIMIT = SUMMARY_LIMIT;
const room = summaryRoom;

/** Le nom de la table, et « (suite) » quand elle reprend sur une page neuve. */
function sectionTitle(doc: Doc, title: string, orderCount: number, y: number): number {
  const count = `${String(orderCount)} commande${orderCount > 1 ? "s" : ""}`;
  put(doc, title, LEFT, y, { size: 13, bold: true });
  putRight(doc, count, RIGHT, y + 2, 10);
  return y + 7 * MM;
}

function tableHead(doc: Doc, y: number): number {
  putCaps(doc, "Produit", LEFT, y);
  putRight(doc, "SKU", X_SKU_RIGHT, y, 9);
  putRight(doc, "Qté", X_QTY_RIGHT, y, 9);
  putRight(doc, "Total HT", RIGHT, y, 9);
  const bottom = y + 4 * MM;
  rule(doc, bottom, 1);
  return bottom + 1.5 * MM;
}

function productRow(
  doc: Doc,
  product: OrderSummaryTableView["products"][number],
  y: number,
): number {
  put(doc, product.name, LEFT, y, { size: 10.5, width: NAME_WIDTH });
  const nameBottom = doc.y;
  putRight(doc, product.sku, X_SKU_RIGHT, y + 0.5, 8.5);
  putRight(doc, saleQuantityText(product.quantity, product.saleUnit), X_QTY_RIGHT, y, 10.5, true);
  putRight(doc, money(product.htCents), RIGHT, y, 10.5);
  const bottom = Math.max(y + ROW_HEIGHT - 1.5 * MM, nameBottom) + 0.5 * MM;
  rule(doc, bottom, 0.5, ROW_GRAY);
  return bottom + 1.5 * MM;
}

/** Les produits, la barre de titres répétée à chaque page. */
function products(doc: Doc, title: string, table: OrderSummaryTableView, top: number): number {
  let y = tableHead(doc, top);
  for (const product of table.products) {
    if (y + ROW_HEIGHT > LIMIT) {
      doc.addPage();
      y = tableHead(doc, sectionTitle(doc, `${title} (suite)`, table.orderCount, MARGIN_Y));
    }
    y = productRow(doc, product, y);
  }
  return y;
}

/**
 * Le bas, cadré à droite comme le pavé d'une facture ; les gestes nuls sont
 * tus. Rejeté seul sur une page neuve, il reprend le nom de sa table.
 */
function bottomBlock(doc: Doc, title: string, table: OrderSummaryTableView, top: number): number {
  const rows = summaryBottomRows(table.bottom).filter((row) => !row.optional || row.cents !== 0);
  const needed = rows.length * BOTTOM_ROW_HEIGHT + 3 * MM;
  let y = top + 2 * MM;
  if (y + needed > LIMIT) {
    doc.addPage();
    y = sectionTitle(doc, `${title} (suite)`, table.orderCount, MARGIN_Y);
  }
  for (const row of rows) {
    if (row.strong) {
      doc
        .save()
        .rect(BOTTOM_BLOCK_LEFT, y, RIGHT - BOTTOM_BLOCK_LEFT, 1)
        .fill()
        .restore();
      y += 2 * MM;
    }
    put(doc, row.label, BOTTOM_BLOCK_LEFT, y, { size: 10, bold: row.strong });
    putRight(doc, money(row.cents), RIGHT, y, 10.5, row.strong);
    y += BOTTOM_ROW_HEIGHT;
  }
  return y + 4 * MM;
}

/** Une table entière : titre, produits (si demandés), bas. */
function section(
  doc: Doc,
  title: string,
  table: OrderSummaryTableView,
  withProducts: boolean,
  top: number,
): number {
  let y = sectionTitle(doc, title, table.orderCount, room(doc, top, SECTION_HEAD_SPACE));
  if (withProducts) {
    y = products(doc, title, table, y);
  }
  return bottomBlock(doc, title, table, y);
}

function excludedSection(doc: Doc, paper: OrderSummaryPaper, top: number): void {
  if (paper.summary.excluded.length === 0) {
    return;
  }
  let y = room(doc, top, 14 * MM);
  putCaps(doc, "COMMANDES EXCLUES DES TOTAUX", LEFT, y);
  y += 5.5 * MM;
  for (const order of paper.summary.excluded) {
    y = room(doc, y, BOTTOM_ROW_HEIGHT);
    put(doc, `${order.orderNumber} — ${exclusionLabel(order.reason)}`, LEFT, y, { size: 10 });
    y += BOTTOM_ROW_HEIGHT;
  }
}

function draw(doc: Doc, paper: OrderSummaryPaper, logo: Buffer): void {
  const { summary } = paper;
  let y = drawSummaryHeader(doc, paper, logo);
  if (summary.companies.length === 0) {
    put(doc, "Aucune commande comptée dans cette sélection.", LEFT, y, { size: 11 });
    y += 8 * MM;
  }
  for (const company of summary.companies) {
    y = section(doc, company.name, company, true, y);
  }
  // Une seule société : sa table EST le total, on n'en répète que le bas.
  y = section(doc, TOTAL_LABEL, summary.total, summary.companies.length > 1, y);
  excludedSection(doc, paper, y);
  // Les bons en ANNEXE, sur page neuve : le récapitulatif se lit d'abord
  // d'un bloc, la liste des bons sert à pointer (§10).
  drawIncludedOrders(doc, summary);
  drawSummaryFolios(doc, paper);
}

/** Rend le PDF. Mêmes entrées, mêmes octets : la date est celle du `Clock`. */
export async function renderOrderSummaryPdf(
  paper: OrderSummaryPaper,
  logo: Buffer,
): Promise<Buffer> {
  return render(
    paper.generatedAt,
    `${SUMMARY_TITLE} — ${paper.requesterName}`,
    (doc) => {
      draw(doc, paper, logo);
    },
    true,
  );
}

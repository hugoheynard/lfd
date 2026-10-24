import type {
  CompanyOrderSummaryView,
  OrderSummaryCompanyView,
  OrderSummaryOrderView,
  OrderSummaryTableView,
} from "@lfd/contracts";

import {
  type Doc,
  LEFT,
  MARGIN_Y,
  MM,
  put,
  putCaps,
  putRight,
  RIGHT,
  ROW_GRAY,
  rule,
  WIDTH,
} from "../../../../platform/pdf/paper-pdf-kit.js";
import { money } from "./order-sheet-pdf-format.js";
import {
  authorLabel,
  fulfillmentLabel,
  orderDayLabel,
  ORDERS_PRETAX_LABEL,
  ORDERS_PRETAX_NOTE,
  ORDERS_SECTION_TITLE,
  ordersGapLabel,
} from "./order-summary-orders.js";
import { TOTAL_LABEL } from "./order-summary-paper.js";
import { SUMMARY_LIMIT, summaryRoom } from "./order-summary-pdf-frame.js";

/**
 * **L'annexe « Bons de commande inclus »** du récapitulatif en PDF (plan
 * `documentation/commandes/boutique/plan-recapitulatif-des-commandes.md`, §10).
 *
 * En annexe, sur page neuve, plutôt qu'entre les tables et le total : le
 * récapitulatif garde sa lecture d'une traite, et la liste — qui peut compter
 * deux cents lignes — sert à pointer les bons un par un. Une sous-section par
 * société, dans l'ordre des tables (le titre nomme le site) ; la barre de
 * titres est reprise en haut de chaque page. Un montant par bon, le « Total
 * HT » de son bon : aucune TVA ni TTC (F5).
 */

const X_DAY = LEFT + 34 * MM;
const X_MODE = X_DAY + 32 * MM;
const X_AUTHOR = X_MODE + 22 * MM;
const COL_HT = 28 * MM;
const AUTHOR_WIDTH = RIGHT - COL_HT - X_AUTHOR - 2 * MM;
const ROW_HEIGHT = 6 * MM;
const FOOT_ROW_HEIGHT = 5 * MM;
const FOOT_LEFT = RIGHT - 110 * MM;

function head(doc: Doc, y: number): number {
  putCaps(doc, "Référence", LEFT, y);
  putCaps(doc, "Jour", X_DAY, y);
  putCaps(doc, "Mode", X_MODE, y);
  putCaps(doc, "Auteur", X_AUTHOR, y);
  putRight(doc, "Total HT", RIGHT, y, 9);
  const bottom = y + 4 * MM;
  rule(doc, bottom, 1);
  return bottom + 1.5 * MM;
}

function companyTitle(doc: Doc, name: string, y: number): number {
  put(doc, name, LEFT, y, { size: 12, bold: true });
  return y + 6.5 * MM;
}

function orderRow(doc: Doc, order: OrderSummaryOrderView, y: number): number {
  put(doc, order.orderNumber, LEFT, y, { size: 10 });
  put(doc, orderDayLabel(order.day), X_DAY, y, { size: 10 });
  put(doc, fulfillmentLabel(order.fulfillmentMethod), X_MODE, y, { size: 10 });
  put(doc, authorLabel(order.author), X_AUTHOR, y, { size: 10, width: AUTHOR_WIDTH });
  const authorBottom = doc.y;
  putRight(doc, money(order.pretaxCents), RIGHT, y, 10);
  const bottom = Math.max(y + ROW_HEIGHT - 1.5 * MM, authorBottom) + 0.5 * MM;
  rule(doc, bottom, 0.5, ROW_GRAY);
  return bottom + 1.5 * MM;
}

/** La somme des HT des bons, et l'écart expliqué s'il y en a un. */
function foot(doc: Doc, label: string, table: OrderSummaryTableView, top: number): number {
  const gap = ordersGapLabel(table.bottom, table.ordersPretax);
  let y = summaryRoom(doc, top + 1.5 * MM, (gap === null ? 1 : 2) * FOOT_ROW_HEIGHT + 2 * MM);
  put(doc, label, FOOT_LEFT, y, { size: 10, bold: true });
  putRight(doc, money(table.ordersPretax.pretaxCents), RIGHT, y, 10.5, true);
  y += FOOT_ROW_HEIGHT;
  if (gap !== null) {
    put(doc, gap, FOOT_LEFT, y, { size: 9, width: RIGHT - COL_HT - FOOT_LEFT });
    putRight(doc, money(table.ordersPretax.gapCents), RIGHT, y, 10);
    y = Math.max(y + FOOT_ROW_HEIGHT, doc.y + 1 * MM);
  }
  return y + 4 * MM;
}

function companyOrders(doc: Doc, company: OrderSummaryCompanyView, top: number): number {
  let y = head(doc, companyTitle(doc, company.name, summaryRoom(doc, top, 20 * MM)));
  for (const order of company.orders) {
    if (y + ROW_HEIGHT > SUMMARY_LIMIT) {
      doc.addPage();
      y = head(doc, companyTitle(doc, `${company.name} (suite)`, MARGIN_Y));
    }
    y = orderRow(doc, order, y);
  }
  return foot(doc, ORDERS_PRETAX_LABEL, company, y);
}

/** L'annexe entière ; rien si aucune commande n'est comptée. */
export function drawIncludedOrders(doc: Doc, summary: CompanyOrderSummaryView): void {
  if (summary.companies.length === 0) {
    return;
  }
  doc.addPage();
  put(doc, ORDERS_SECTION_TITLE.toUpperCase(), LEFT, MARGIN_Y, { size: 14, bold: true });
  put(doc, ORDERS_PRETAX_NOTE, LEFT, MARGIN_Y + 7 * MM, { size: 9, width: WIDTH });
  let y = doc.y + 5 * MM;
  for (const company of summary.companies) {
    y = companyOrders(doc, company, y);
  }
  // Plusieurs sociétés : la somme de tous les bons, rapprochée du total général.
  if (summary.companies.length > 1) {
    foot(doc, `${ORDERS_PRETAX_LABEL} — ${TOTAL_LABEL.toLowerCase()}`, summary.total, y);
  }
}

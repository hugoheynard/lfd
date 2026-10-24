import type {
  CompanyOrderSummaryView,
  OrderSummaryCompanyView,
  OrderSummaryTableView,
} from "@lfd/contracts";

import { CSV_BOM, CSV_SEPARATOR, csvEuros, csvQuoted } from "../../../../platform/csv/csv-cells.js";
import { parisDateTime } from "../../../../platform/pdf/paper-pdf-kit.js";
import {
  exclusionLabel,
  type OrderSummaryPaper,
  selectionSentence,
  SUMMARY_SCOPE_NOTE,
  SUMMARY_TITLE,
  summaryBottomRows,
  TOTAL_LABEL,
} from "./order-summary-paper.js";
import {
  authorLabel,
  fulfillmentLabel,
  ORDERS_PRETAX_LABEL,
  ORDERS_SECTION_TITLE,
  ordersGapLabel,
} from "./order-summary-orders.js";
import { periodSentence } from "./order-summary-period.js";

/**
 * **Le récapitulatif au tableur** (plan
 * `documentation/commandes/boutique/plan-recapitulatif-des-commandes.md`, lot R2) — pur,
 * à partir du récapitulatif déjà calculé.
 *
 * Une ligne par (société, produit), puis les lignes du bas de la société ; le
 * total général suit sous la même forme, puis les commandes exclues, puis le
 * bloc des bons inclus (§10) : une ligne par bon, son HT seul. Les
 * cellules sont celles de la comptabilité (`platform/csv/csv-cells.ts`) : BOM,
 * point-virgule, virgule décimale, formules neutralisées. Toutes les lignes
 * du bas y sont, même à zéro : un tableur lit des lignes stables.
 */
export function renderOrderSummaryCsv(paper: OrderSummaryPaper): string {
  const { summary } = paper;
  const rows = [
    line([csvQuoted(SUMMARY_TITLE)]),
    line([
      csvQuoted(paper.requesterName),
      csvQuoted(`Généré le ${parisDateTime(paper.generatedAt)}`),
    ]),
    ...periodRows(paper),
    line([csvQuoted(selectionSentence(summary))]),
    line([csvQuoted(SUMMARY_SCOPE_NOTE)]),
    "",
    line(["Société", "Produit", "SKU", "Quantité", "Montant HT (€)"].map(csvQuoted)),
    ...summary.companies.flatMap((company) => tableRows(company.name, company)),
    ...tableRows(TOTAL_LABEL, summary.total),
    ...excludedRows(paper),
    ...includedOrderRows(paper.summary),
  ];
  return `${CSV_BOM}${rows.join("\r\n")}\r\n`;
}

/** La période du filtre (§9), sur sa ligne — aucune sans borne. */
function periodRows(paper: OrderSummaryPaper): readonly string[] {
  const period = periodSentence(paper.period);
  return period === null ? [] : [line([csvQuoted(period)])];
}

function line(cells: readonly string[]): string {
  return cells.join(CSV_SEPARATOR);
}

/** Les produits d'une table, puis son bas, sous le nom de la société. */
function tableRows(owner: string, table: OrderSummaryTableView): readonly string[] {
  return [
    ...table.products.map((product) =>
      line([
        csvQuoted(owner),
        csvQuoted(product.name),
        csvQuoted(product.sku),
        String(product.quantity),
        csvEuros(product.htCents),
      ]),
    ),
    ...summaryBottomRows(table.bottom).map((row) =>
      line([csvQuoted(owner), csvQuoted(row.label), csvQuoted(""), "", csvEuros(row.cents)]),
    ),
  ];
}

function excludedRows(paper: OrderSummaryPaper): readonly string[] {
  if (paper.summary.excluded.length === 0) {
    return [];
  }
  return [
    "",
    line(["Commande exclue", "Raison"].map(csvQuoted)),
    ...paper.summary.excluded.map((order) =>
      line([csvQuoted(order.orderNumber), csvQuoted(exclusionLabel(order.reason))]),
    ),
  ];
}

/** `2026-10-07` → `07/10/2026`, ce qu'un tableur reconnaît comme une date. */
function csvDay(day: string | null): string {
  return day === null ? "" : `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
}

/** Le pied d'un bloc de bons : leur somme, puis l'écart expliqué s'il y en a un. */
function pretaxFootRows(owner: string, table: OrderSummaryTableView): readonly string[] {
  const gap = ordersGapLabel(table.bottom, table.ordersPretax);
  const foot = (label: string, cents: number): string =>
    line([csvQuoted(label), csvQuoted(owner), "", csvQuoted(""), csvQuoted(""), csvEuros(cents)]);
  return [
    foot(ORDERS_PRETAX_LABEL, table.ordersPretax.pretaxCents),
    ...(gap === null ? [] : [foot(gap, table.ordersPretax.gapCents)]),
  ];
}

function companyOrderRows(company: OrderSummaryCompanyView): readonly string[] {
  return [
    ...company.orders.map((order) =>
      line([
        csvQuoted(order.orderNumber),
        csvQuoted(company.name),
        csvDay(order.day),
        csvQuoted(fulfillmentLabel(order.fulfillmentMethod)),
        csvQuoted(authorLabel(order.author)),
        csvEuros(order.pretaxCents),
      ]),
    ),
    ...pretaxFootRows(company.name, company),
  ];
}

/**
 * Le bloc « bons » (§10) : une ligne par bon compté, par société dans l'ordre
 * des tables, le HT de son bon et rien d'autre (F5).
 */
function includedOrderRows(summary: CompanyOrderSummaryView): readonly string[] {
  if (summary.companies.length === 0) {
    return [];
  }
  return [
    "",
    line([csvQuoted(ORDERS_SECTION_TITLE)]),
    line(["Bon de commande", "Société", "Jour", "Mode", "Auteur", "Montant HT (€)"].map(csvQuoted)),
    ...summary.companies.flatMap(companyOrderRows),
    ...(summary.companies.length > 1 ? pretaxFootRows(TOTAL_LABEL, summary.total) : []),
  ];
}

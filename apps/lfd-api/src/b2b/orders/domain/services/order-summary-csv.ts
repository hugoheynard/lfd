import type { OrderSummaryTableView } from "@lfd/contracts";

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

/**
 * **Le récapitulatif au tableur** (plan
 * `documentation/commandes/plan-recapitulatif-des-commandes.md`, lot R2) — pur,
 * à partir du récapitulatif déjà calculé.
 *
 * Une ligne par (société, produit), puis les lignes du bas de la société ; le
 * total général suit sous la même forme, puis les commandes exclues. Les
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
    line([csvQuoted(selectionSentence(summary))]),
    line([csvQuoted(SUMMARY_SCOPE_NOTE)]),
    "",
    line(["Société", "Produit", "SKU", "Quantité", "Montant HT (€)"].map(csvQuoted)),
    ...summary.companies.flatMap((company) => tableRows(company.name, company)),
    ...tableRows(TOTAL_LABEL, summary.total),
    ...excludedRows(paper),
  ];
  return `${CSV_BOM}${rows.join("\r\n")}\r\n`;
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

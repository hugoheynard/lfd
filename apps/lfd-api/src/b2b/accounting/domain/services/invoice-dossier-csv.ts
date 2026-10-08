import { CSV_BOM, CSV_SEPARATOR, csvEuros, csvQuoted } from "./csv-cells.js";
import { rateLabel, STATEMENT_SCOPE } from "./cycle-statement-csv.js";
import type { DossierCalendarNotes } from "./invoice-dossier-calendar.js";
import { historyCell, placeCell } from "./invoice-dossier-history-cells.js";
import { neverHandedOver, type DossierOrderRecord } from "./invoice-dossier-history.js";
import type { FrozenInvoiceOrder, InvoiceDossier } from "./invoice-dossier.types.js";

/** Ce que l'en-tête de chaque fichier dit de lui-même. */
export interface InvoiceDossierCsvHeading {
  readonly companyName: string;
  /** `2026-10`. */
  readonly month: string;
  readonly inProgress: boolean;
}

/**
 * **Les trois CSV du dossier** — la facture, les bons, les écarts. Ils
 * recopient le dossier déjà calculé, aucun ne refait de calcul ; les cellules
 * sont celles du relevé (`csv-cells.ts`) pour s'ouvrir pareil chez le même
 * comptable.
 */
export function invoiceCsv(dossier: InvoiceDossier, heading: InvoiceDossierCsvHeading): string {
  const { invoice } = dossier;
  const rows = [
    row([
      "SKU",
      "Libellé",
      "Prix unitaire HT (€)",
      "Taux",
      "Quantité",
      "Montant HT (€)",
      "Du",
      "Au",
    ]),
    ...invoice.lines.map((line) =>
      [
        csvQuoted(line.sku),
        csvQuoted(line.label),
        csvQuoted(millicentsAsEuros(line.unitPriceMillicents)),
        csvQuoted(rateLabel(line.vatRate)),
        String(line.quantity),
        csvEuros(line.amountCents),
        csvQuoted(line.firstDeliveryDate ?? ""),
        csvQuoted(line.lastDeliveryDate ?? ""),
      ].join(CSV_SEPARATOR),
    ),
    "",
    labelled("Remise société HT (€)", -invoice.companyDiscountCents),
    labelled("Bon de fidélité HT (€)", -invoice.voucherDiscountCents),
    ...invoice.deliveries.map((delivery) =>
      labelled(`Livraison HT — ${DELIVERY_MODE_LABEL[delivery.mode]} (€)`, delivery.amountCents),
    ),
    labelled("Surtaxe de retard HT (€)", invoice.lateFeeCents),
    "",
    row(["Taux", "Base marchandises HT (€)", "Base imposable HT (€)", "TVA (€)"]),
    ...invoice.vat.categories.map((category) =>
      [
        csvQuoted(rateLabel(category.rate)),
        csvEuros(category.goodsHtCents),
        csvEuros(category.taxableBaseCents),
        csvEuros(category.vatCents),
      ].join(CSV_SEPARATOR),
    ),
    "",
    labelled("Total HT (€)", invoice.vat.taxableBaseCents),
    labelled("TVA (€)", invoice.vat.vatCents),
    labelled("Total TTC (€)", invoice.totalCents),
  ];
  return file(headingRows("Facture simulée", heading), rows);
}

/** Une ligne par bon, montants tels que figés, son lieu, sa frise, et ce que le calendrier en dit. */
export function ordersCsv(
  records: readonly DossierOrderRecord[],
  calendar: DossierCalendarNotes,
  heading: InvoiceDossierCsvHeading,
): string {
  const otherMonth = new Set(calendar.otherMonth.map((order) => order.reference));
  const rows = [
    row([
      "Référence",
      "Passation",
      "Livraison demandée",
      "Livré le (tournée)",
      "Lieu",
      "Marchandises HT (€)",
      "Remise HT (€)",
      "Bon de fidélité HT (€)",
      "Livraison HT (€)",
      "Surtaxe de retard HT (€)",
      "TVA (€)",
      "TTC (€)",
      "Remarque",
      "Historique retrait / livraison",
    ]),
    ...records.map(({ order, place, history }) =>
      [
        csvQuoted(order.reference),
        csvQuoted(order.createdAt.toISOString()),
        csvQuoted(order.requestedDeliveryDate ?? ""),
        csvQuoted(history.actualDeliveryDay ?? ""),
        csvQuoted(placeCell(place)),
        csvEuros(order.lines.reduce((total, line) => total + line.lineTotalCents, 0)),
        csvEuros(order.discountCents),
        csvEuros(order.voucherDiscountCents),
        csvEuros(order.deliveryFeeCents),
        csvEuros(order.lateFeeCents),
        csvEuros(order.vatCents),
        csvEuros(order.totalCents),
        csvQuoted(remarkOf(order, otherMonth)),
        csvQuoted(historyCell(history)),
      ].join(CSV_SEPARATOR),
    ),
  ];
  const unhanded = neverHandedOver(records);
  const warning =
    unhanded.length === 0
      ? []
      : [csvQuoted(`Facturés sans aucun fait de retrait : ${unhanded.join(", ")}`), ""];
  return file(headingRows("Bons du dossier", heading), [...warning, ...rows]);
}

/** Les écarts, terme par terme, et leur somme. */
export function gapsCsv(dossier: InvoiceDossier, heading: InvoiceDossierCsvHeading): string {
  const { gaps } = dossier;
  const rows = [
    row(["Écart", "Détail", "Facture (€)", "Bons (€)", "Écart (€)"]),
    ...gaps.vatRounding.map((gap) =>
      [
        csvQuoted("Arrondi de la TVA"),
        csvQuoted(rateLabel(gap.rate)),
        csvEuros(gap.invoiceVatCents),
        csvEuros(gap.ordersVatCents),
        csvEuros(gap.gapCents),
      ].join(CSV_SEPARATOR),
    ),
    [
      csvQuoted("TVA non ventilée"),
      csvQuoted("bons d'avant le 2026-09-07"),
      csvEuros(gaps.unventilatedVat.invoiceVatCents),
      csvEuros(gaps.unventilatedVat.ordersVatCents),
      csvEuros(gaps.unventilatedVat.gapCents),
    ].join(CSV_SEPARATOR),
    ...dossier.inconsistentOrders.map((order) =>
      [
        csvQuoted("Bon incohérent"),
        csvQuoted(order.reference),
        csvEuros(order.recomposedTotalCents),
        csvEuros(order.totalCents),
        csvEuros(order.gapCents),
      ].join(CSV_SEPARATOR),
    ),
    "",
    [
      csvQuoted("Total"),
      csvQuoted("total facture − Σ bons"),
      csvEuros(dossier.invoice.totalCents),
      csvEuros(dossier.ordersTotalCents),
      csvEuros(gaps.totalCents),
    ].join(CSV_SEPARATOR),
  ];
  return file(headingRows("Écarts facture / bons", heading), rows);
}

const DELIVERY_MODE_LABEL = {
  standard: "taux normal",
  follows_goods: "au prorata des marchandises",
} as const;

const MILLICENTS_PER_EURO = 100_000;
const MILLICENTS_DECIMALS = 5;

/** Millicentimes → `0,33333` : le prix unitaire garde ses cinq décimales. */
function millicentsAsEuros(millicents: number): string {
  const sign = millicents < 0 ? "-" : "";
  const absolute = Math.abs(millicents);
  const units = String(Math.trunc(absolute / MILLICENTS_PER_EURO));
  const decimals = String(absolute % MILLICENTS_PER_EURO).padStart(MILLICENTS_DECIMALS, "0");
  return `${sign}${units},${decimals}`;
}

function remarkOf(order: FrozenInvoiceOrder, otherMonth: ReadonlySet<string>): string {
  if (order.requestedDeliveryDate === null) {
    return "sans date demandée";
  }
  return otherMonth.has(order.reference) ? "livré un autre mois" : "";
}

function headingRows(title: string, heading: InvoiceDossierCsvHeading): readonly string[] {
  const state = heading.inProgress ? "cycle en cours, non clos" : "cycle clos";
  return [
    csvQuoted(`${title} — ${heading.companyName} — ${heading.month} (${state})`),
    csvQuoted(STATEMENT_SCOPE),
    csvQuoted("Simulation : ce n'est pas une facture émise, et rien n'est prélevé sur sa base."),
  ];
}

function row(cells: readonly string[]): string {
  return cells.map(csvQuoted).join(CSV_SEPARATOR);
}

function labelled(label: string, cents: number): string {
  return [csvQuoted(label), csvEuros(cents)].join(CSV_SEPARATOR);
}

function file(heading: readonly string[], rows: readonly string[]): string {
  return CSV_BOM + [...heading, "", ...rows].join("\r\n") + "\r\n";
}

import { instantToLocal } from "@lfd/contracts";

import type { FrozenVatShare } from "../ports/cycle-orders.reader.js";
import { CSV_BOM, CSV_SEPARATOR, csvEuros, csvQuoted } from "./csv-cells.js";
import type { StatementAggregate, StatementLine, StatementTotals } from "./cycle-statement.js";

/** Ce que l'en-tête du fichier doit dire de lui-même. */
export interface StatementCsvHeading {
  readonly companyName: string;
  /** `2026-09`. */
  readonly month: string;
  readonly startsAt: Date;
  readonly closesAt: Date;
  readonly inProgress: boolean;
}

/**
 * Le **périmètre**, en toutes lettres. Le relevé ne couvre pas tout le chiffre
 * d'affaires, et un fichier rangé sur un bureau perd l'écran qui le disait
 * (plan `agregation-des-commandes`, §1.1).
 */
export const STATEMENT_SCOPE =
  "Périmètre : commandes passées au compte (prélèvement mensuel). " +
  "Hors commandes payées par carte, commandes gratuites, commandes de particuliers et commandes annulées.";

/**
 * Le relevé en CSV, **une ligne par commande**.
 *
 * Les montants sont ceux du relevé, déjà agrégé : le fichier ne refait aucun
 * calcul, il recopie. La TVA est en colonnes, une par taux présent dans le
 * cycle, plus la colonne « non ventilée » — la somme d'une ligne retombe donc
 * sur sa TVA totale, sans qu'aucune part ne soit recalculée.
 */
export function statementCsv(statement: StatementAggregate, heading: StatementCsvHeading): string {
  const rates = statement.totals.vatByRate.map((share) => share.rate);
  const rows = [
    ...headingRows(heading),
    "",
    headers(rates).map(csvQuoted).join(CSV_SEPARATOR),
    ...statement.lines.map((line) => orderRow(line, heading, rates)),
    "",
    totalRow(statement.totals, rates),
  ];
  return CSV_BOM + rows.join("\r\n") + "\r\n";
}

function headingRows(heading: StatementCsvHeading): readonly string[] {
  const state = heading.inProgress ? "cycle en cours, non clos" : "cycle clos";
  return [
    csvQuoted(`Relevé PROVISOIRE — ${heading.companyName} — ${heading.month} (${state})`),
    csvQuoted(
      `Du ${localDay(heading.startsAt)} 00h00 inclus au ${localDay(heading.closesAt)} 00h00 exclu, heure de Paris.`,
    ),
    csvQuoted(STATEMENT_SCOPE),
    csvQuoted(
      "Provisoire : recalculé à chaque lecture ; une commande annulée après coup en sort. Ce n'est pas une facture.",
    ),
  ];
}

function headers(rates: readonly number[]): readonly string[] {
  return [
    "Date",
    "Référence",
    "Site",
    "Payeur",
    "Cycle",
    "Marchandises HT (€)",
    "Remise HT (€)",
    "Bon de fidélité HT (€)",
    "Net marchandises HT (€)",
    "Livraison HT (€)",
    "Surtaxe de retard HT (€)",
    ...rates.map((rate) => `TVA ${rateLabel(rate)} (€)`),
    "TVA non ventilée (€)",
    "TVA totale (€)",
    "TTC (€)",
  ];
}

function orderRow(
  line: StatementLine,
  heading: StatementCsvHeading,
  rates: readonly number[],
): string {
  return [
    csvQuoted(localDay(line.placedAt)),
    csvQuoted(line.orderNumber),
    csvQuoted(line.siteName),
    // Le payeur est la société du relevé, sauf pour la commande d'un site qui
    // suivait `billing` à sa date : le relevé de ce site nomme alors qui paie.
    csvQuoted(line.paidBy?.name ?? heading.companyName),
    csvQuoted(heading.month),
    csvEuros(line.subtotalCents),
    csvEuros(line.discountCents),
    csvEuros(line.voucherDiscountCents),
    csvEuros(line.htCents),
    csvEuros(line.deliveryFeeCents),
    csvEuros(line.lateFeeCents),
    ...rates.map((rate) => csvEuros(line.vatVentilated ? shareOf(line.vatShares, rate) : 0)),
    csvEuros(line.vatVentilated ? 0 : line.vatCents),
    csvEuros(line.vatCents),
    csvEuros(line.totalCents),
  ].join(CSV_SEPARATOR);
}

function totalRow(totals: StatementTotals, rates: readonly number[]): string {
  return [
    csvQuoted("Total"),
    csvQuoted(`${String(totals.orderCount)} commande(s)`),
    "",
    "",
    "",
    csvEuros(totals.subtotalCents),
    csvEuros(totals.discountCents),
    csvEuros(totals.voucherDiscountCents),
    csvEuros(totals.htCents),
    csvEuros(totals.deliveryFeeCents),
    csvEuros(totals.lateFeeCents),
    ...rates.map((rate) => csvEuros(shareOf(totals.vatByRate, rate))),
    csvEuros(totals.unventilatedVatCents),
    csvEuros(totals.vatCents),
    csvEuros(totals.totalCents),
  ].join(CSV_SEPARATOR);
}

function shareOf(shares: readonly FrozenVatShare[] | null, rate: number): number {
  return (shares ?? []).reduce(
    (total, share) => total + (share.rate === rate ? share.amountCents : 0),
    0,
  );
}

/** `5.5` → `5,5 %` ; `20` → `20 %`. */
export function rateLabel(rate: number): string {
  return `${String(rate).replace(".", ",")} %`;
}

/** Le jour LOCAL de l'instant — une commande de 23h30 en UTC est du lendemain à Paris. */
function localDay(instant: Date): string {
  return instantToLocal(instant).day;
}

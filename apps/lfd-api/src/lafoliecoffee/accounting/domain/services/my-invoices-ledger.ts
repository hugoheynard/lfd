import type { InvoiceSettlement, InvoiceSettlementStatus } from "./invoice-settlement.js";

/**
 * **Le total dû et les filtres de « Mes factures »** (plan
 * `plan-page-mes-factures.md`, §1, §7.1–7.3).
 */

/** Une pièce telle que le total et les filtres la lisent. */
export interface LedgerEntry {
  readonly number: string;
  readonly isCreditNote: boolean;
  /** `AAAA-MM-JJ`. */
  readonly issuedOn: string;
  readonly totalTtcCents: number;
  readonly settlement: InvoiceSettlement | null;
}

export interface AmountDue {
  readonly totalCents: number;
  readonly invoiceCount: number;
  readonly rejectedCount: number;
  readonly rejectedCents: number;
}

/**
 * Ce que le client doit encore : un prélèvement à venir ou rejeté (Q2). Hors
 * du total : l'acquittée, la prélevée, la réglée, la clôturée (Q-D : passer
 * en perte, c'est renoncer) et celle « en cours de traitement » (Q-E : elle
 * attend NOTRE décision). Une re-présentée attend un nouveau prélèvement :
 * elle est due.
 */
const DUE: ReadonlySet<InvoiceSettlementStatus> = new Set([
  "collection_planned",
  "collection_rejected",
  "recollection_planned",
]);

/**
 * Le total dû du COMPTE — il ne suit pas les filtres (§7.3). Les avoirs ne
 * s'y soustraient pas (Q2) : ils n'ont pas de statut, donc n'y entrent pas.
 */
export function amountDueOf(entries: readonly LedgerEntry[]): AmountDue {
  let totalCents = 0;
  let invoiceCount = 0;
  let rejectedCount = 0;
  let rejectedCents = 0;
  for (const entry of entries) {
    const status = entry.settlement?.status;
    if (status === undefined || !DUE.has(status)) {
      continue;
    }
    totalCents += entry.totalTtcCents;
    invoiceCount += 1;
    if (status === "collection_rejected") {
      rejectedCount += 1;
      rejectedCents += entry.totalTtcCents;
    }
  }
  return { totalCents, invoiceCount, rejectedCount, rejectedCents };
}

/** Les filtres de la liste : l'année et le mois d'ÉMISSION, le genre de pièce. */
export interface LedgerFilter {
  readonly year: number | null;
  /** 1 à 12 ; seulement avec une année. */
  readonly month: number | null;
  readonly kind: "invoice" | "credit_note" | null;
}

export const NO_LEDGER_FILTER: LedgerFilter = { year: null, month: null, kind: null };

/** Ce que le filtre et l'ordre lisent d'une pièce — le zip (P2) filtre aussi par là. */
export type FilterableEntry = Pick<LedgerEntry, "number" | "isCreditNote" | "issuedOn">;

/** Les pièces retenues par le filtre, les plus récentes d'abord (numéro décroissant). */
export function filteredLedger<T extends FilterableEntry>(
  entries: readonly T[],
  filter: LedgerFilter,
): readonly T[] {
  return entries
    .filter((entry) => matches(entry, filter))
    .sort((a, b) => (a.number < b.number ? 1 : a.number > b.number ? -1 : 0));
}

function matches(entry: FilterableEntry, filter: LedgerFilter): boolean {
  const [year, month] = entry.issuedOn.split("-").map(Number);
  if (filter.kind !== null && (filter.kind === "credit_note") !== entry.isCreditNote) {
    return false;
  }
  return (
    (filter.year === null || year === filter.year) &&
    (filter.month === null || month === filter.month)
  );
}

import type { UnpaidTransferInvoice } from "../ports/unpaid-transfer-invoices.reader.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Une facture au virement non réglée, jugée au jour de Paris. */
export interface TransferArrear extends UnpaidTransferInvoice {
  /** `true` dès le lendemain de l'échéance. */
  readonly overdue: boolean;
  /** Jours écoulés depuis l'échéance ; `0` tant qu'elle n'est pas passée. */
  readonly daysLate: number;
}

/**
 * Les jours de retard d'une facture au virement (V8) : le jour de l'échéance
 * n'est pas un retard, le lendemain en est un premier. Deux jours civils,
 * comparés entre eux — l'horloge n'entre que par `today`.
 */
export function daysLateOf(dueOn: string, today: string): number {
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(dueOn)) / DAY_MS));
}

/**
 * **Les impayés de factures au virement** (V8, C7 ; Q2 : on SIGNALE, rien ne
 * bloque) : chaque facture non réglée avec son retard, les plus en retard
 * d'abord, puis par numéro.
 */
export function transferArrearsOf(
  invoices: readonly UnpaidTransferInvoice[],
  today: string,
): readonly TransferArrear[] {
  return invoices
    .map((invoice) => {
      const daysLate = daysLateOf(invoice.dueOn, today);
      return { ...invoice, overdue: daysLate > 0, daysLate };
    })
    .sort((a, b) => b.daysLate - a.daysLate || (a.number < b.number ? -1 : 1));
}

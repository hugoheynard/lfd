import type { UnpaidTransferInvoice } from "../ports/unpaid-transfer-invoices.reader.js";
import { businessDaysAfter } from "./target2-calendar.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Une facture au virement non réglée, jugée au jour de Paris. */
export interface TransferArrear extends UnpaidTransferInvoice {
  /** `true` dès le premier jour ouvré qui suit l'échéance (`transferOverdueFrom`). */
  readonly overdue: boolean;
  /** Jours écoulés depuis l'échéance ; `0` tant qu'elle n'est pas passée. */
  readonly daysLate: number;
}

/**
 * **Le premier jour où une facture au virement est en retard** (V8, Hugo,
 * 2026-11-13) : le premier jour ouvré (TARGET2, le calendrier des lots) qui
 * SUIT strictement l'échéance imprimée.
 *
 * L'échéance n'est pas reportée sur la facture (`transferDueDay`) ; c'est le
 * CONSTAT qui attend que la banque ait pu passer le virement. Ainsi :
 *
 * - échéance un mercredi ordinaire → en retard le jeudi (le lendemain) ;
 * - échéance un vendredi → en retard le lundi, pas le samedi ;
 * - échéance un samedi ou un dimanche → en retard le lundi ;
 * - échéance la veille d'un jour fermé (24 décembre) → en retard au
 *   premier jour rouvert après les fermetures.
 */
export function transferOverdueFrom(dueOn: string): string {
  return businessDaysAfter(dueOn, 1);
}

/** Le retard est-il constaté ce jour-là ? Deux jours `AAAA-MM-JJ`, comparés entre eux. */
export function isTransferOverdue(dueOn: string, today: string): boolean {
  return today >= transferOverdueFrom(dueOn);
}

/**
 * Les jours de retard d'une facture au virement (V8) : `0` tant que le retard
 * n'est pas constaté (`isTransferOverdue`), puis les jours civils écoulés
 * DEPUIS L'ÉCHÉANCE — un retard constaté un lundi pour une échéance du samedi
 * compte deux jours. L'horloge n'entre que par `today`.
 */
export function daysLateOf(dueOn: string, today: string): number {
  if (!isTransferOverdue(dueOn, today)) {
    return 0;
  }
  return Math.round((Date.parse(today) - Date.parse(dueOn)) / DAY_MS);
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

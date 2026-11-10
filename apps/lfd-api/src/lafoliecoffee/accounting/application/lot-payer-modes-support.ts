import type { BillingRhythmKind } from "@lfd/contracts";

import type { BillingCycle } from "../domain/services/billing-cycle.js";
import type { InvoicePeriodsReader } from "../domain/ports/invoice-periods.reader.js";
import type { InvoicingCalendar } from "../domain/services/invoicing-calendar.js";
import {
  lotPayerModeCounts,
  lotPayerModes,
  lotPayerPeriods,
  type LotPayerRef,
} from "../domain/services/lot-payer-modes.js";

/** Un lot à décrire : ses payeurs, sa clôture. */
export interface LotToDescribe {
  readonly payerRefs: readonly LotPayerRef[];
  readonly closesAt: Date;
}

/**
 * Les modes des clients de chaque lot, dans l'ordre donné (Hugo, 2026-10-12) :
 * une seule lecture des périodes pour tous les lots, puis `lotPayerModes`.
 * Partagé par la liste des lots et l'aperçu — une règle, deux lecteurs.
 */
export async function readLotPayerModes(
  periods: InvoicePeriodsReader,
  calendar: InvoicingCalendar,
  lots: readonly LotToDescribe[],
): Promise<readonly (readonly BillingRhythmKind[])[]> {
  const invoiceIds = lots.flatMap((lot) =>
    lot.payerRefs.flatMap((ref) => (ref.invoiceId === null ? [] : [ref.invoiceId])),
  );
  const known: ReadonlyMap<string, BillingCycle> =
    invoiceIds.length === 0 ? new Map() : await periods.periodsOf(invoiceIds);
  return lots.map((lot) =>
    lotPayerModes(
      calendar,
      lotPayerPeriods(lot.payerRefs, (id) => known.get(id)?.closesAt, lot.closesAt),
    ),
  );
}

/**
 * Les clients par rythme de plusieurs lots pris ENSEMBLE — ceux d'une même
 * procédure (CORE et B2B) : un payeur n'est compté qu'une fois par mode.
 */
export async function readLotsPayerModeCounts(
  periods: InvoicePeriodsReader,
  calendar: InvoicingCalendar,
  lots: readonly LotToDescribe[],
): Promise<readonly { readonly mode: BillingRhythmKind; readonly count: number }[]> {
  const invoiceIds = lots.flatMap((lot) =>
    lot.payerRefs.flatMap((ref) => (ref.invoiceId === null ? [] : [ref.invoiceId])),
  );
  const known: ReadonlyMap<string, BillingCycle> =
    invoiceIds.length === 0 ? new Map() : await periods.periodsOf(invoiceIds);
  return lotPayerModeCounts(
    calendar,
    lots.flatMap((lot) =>
      lotPayerPeriods(lot.payerRefs, (id) => known.get(id)?.closesAt, lot.closesAt),
    ),
  );
}

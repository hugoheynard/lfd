import { localToInstant, type CollectionProcedureIdentityView } from "@lfd/contracts";

import type { StoredBatchView } from "../domain/ports/collection-batch.reader.js";
import type { InvoicePeriodsReader } from "../domain/ports/invoice-periods.reader.js";
import { procedureCodeOfDay } from "../domain/services/collection-procedure-code.js";
import { closureDayOf } from "../domain/services/collection-procedure-id.js";
import type { InvoicingCalendar } from "../domain/services/invoicing-calendar.js";
import { readLotsPayerModeCounts } from "./lot-payer-modes-support.js";
import type { ProcedureRhythmsOf } from "./procedure-rhythms-support.js";

/** Minuit à Paris : l'instant d'une clôture, depuis son jour. */
const CLOSURE_TIME = "00:00";

/** Les lots d'une clôture, dans l'ordre donné. */
export function batchesOfClosure(
  stored: readonly StoredBatchView[],
  closureDay: string,
): readonly StoredBatchView[] {
  return stored.filter((batch) => closureDayOf(new Date(batch.cycleClosesAt)) === closureDay);
}

/**
 * **La procédure ouverte** (2026-10-23) : son code, ses rythmes — ceux qui
 * ont des clients (`procedureRhythms`) ; deux ou plus, elle est mutualisée —
 * et combien de clients de chacun ses lots non annulés prélèvent, lus de
 * leurs factures. Rien de compté sans lot : `payerCounts` reste `null`.
 */
export async function procedureIdentityOf(
  periods: InvoicePeriodsReader,
  calendar: InvoicingCalendar,
  closureDay: string,
  ofClosure: readonly StoredBatchView[],
  rhythmsOf: ProcedureRhythmsOf,
): Promise<CollectionProcedureIdentityView> {
  const closesAt = localToInstant(closureDay, CLOSURE_TIME);
  const closureModes = closesAt === null ? [] : rhythmsOf(closesAt);
  const live = ofClosure.filter((batch) => batch.status !== "cancelled");
  return {
    code: procedureCodeOfDay(closureDay, closureModes),
    closureDay,
    closureModes,
    payerCounts:
      live.length === 0
        ? null
        : await readLotsPayerModeCounts(
            periods,
            calendar,
            live.map((batch) => ({
              payerRefs: batch.payerRefs,
              closesAt: new Date(batch.cycleClosesAt),
            })),
          ),
  };
}

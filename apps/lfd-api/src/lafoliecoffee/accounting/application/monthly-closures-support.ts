import type { MonthlyClosureBatchView, MonthlyClosureView } from "@lfd/contracts";

import type { ClosureBatchRead } from "../domain/ports/closure-batches.reader.js";
import type { MonthlyInvoicesRead } from "../domain/ports/monthly-invoices.reader.js";
import type { InvoicingCalendar } from "../domain/services/invoicing-calendar.js";
import { invoicingMomentOf, periodLabelOf } from "../domain/services/invoicing-closures.js";

/**
 * Une clôture telle que l'écran « Prélèvement du mois » la lit (M4c) : la
 * période la plus longue qui s'y clôt, les modes qui y closent, ce que le
 * lecteur des factures en rend, et ses lots.
 */
export function closureView(
  calendar: InvoicingCalendar,
  closesAt: Date,
  read: MonthlyInvoicesRead,
  batches: readonly ClosureBatchRead[],
  now: Date,
): MonthlyClosureView {
  const period = calendar.periodOf(closesAt);
  const issuableFrom = invoicingMomentOf(closesAt);
  return {
    periodClosesAt: closesAt.toISOString(),
    periodStartsAt: period.startsAt.toISOString(),
    periodLabel: periodLabelOf(period),
    modes: calendar.modesClosingAt(closesAt),
    issuableFrom: issuableFrom.toISOString(),
    reached: issuableFrom.getTime() <= now.getTime(),
    floorAt: read.floorAt?.toISOString() ?? null,
    open: read.floorAt !== null && read.floorAt.getTime() < closesAt.getTime(),
    invoices: read.invoices,
    signaled: read.signaled,
    autopilotRun: read.autopilotRun,
    batches: batchesAt(batches, closesAt),
  };
}

function batchesAt(
  batches: readonly ClosureBatchRead[],
  closesAt: Date,
): readonly MonthlyClosureBatchView[] {
  return batches
    .filter((read) => read.closesAt.getTime() === closesAt.getTime())
    .map((read) => read.batch);
}

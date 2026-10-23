import type { StoredBatchView } from "../domain/ports/collection-batch.reader.js";
import type { InvoicePeriodsReader } from "../domain/ports/invoice-periods.reader.js";
import { closureDayOf } from "../domain/services/collection-procedure-id.js";
import type { InvoicingCalendar } from "../domain/services/invoicing-calendar.js";
import { procedureRhythms } from "../domain/services/procedure-rhythms.js";
import type { BillingMode } from "../domain/value-objects/billing-mode.js";
import { readLotPayerModes } from "./lot-payer-modes-support.js";

/** Les rythmes de la procédure close à cet instant. */
export type ProcedureRhythmsOf = (closesAt: Date) => readonly BillingMode[];

/**
 * Les rythmes des clients des lots de chaque clôture, par jour de clôture :
 * ceux des lots vivants, ou — s'il n'y a que des lots annulés — ceux des
 * annulés, pour qu'une procédure abandonnée garde le code de ses fichiers.
 * `modes[i]` est celui de `stored[i]` (`readLotPayerModes`).
 */
export function lotModesByClosureDay(
  stored: readonly StoredBatchView[],
  modes: readonly (readonly BillingMode[])[],
): ReadonlyMap<string, readonly BillingMode[]> {
  const live = new Map<string, Set<BillingMode>>();
  const cancelled = new Map<string, Set<BillingMode>>();
  stored.forEach((batch, index) => {
    const into = batch.status === "cancelled" ? cancelled : live;
    const day = closureDayOf(new Date(batch.cycleClosesAt));
    const known = into.get(day) ?? new Set<BillingMode>();
    (modes[index] ?? []).forEach((mode) => known.add(mode));
    into.set(day, known);
  });
  const byDay = new Map<string, readonly BillingMode[]>();
  for (const [day, set] of [...cancelled, ...live]) {
    byDay.set(day, [...set]);
  }
  return byDay;
}

/** Les mêmes, lus : une lecture des périodes pour tous les lots. */
export async function readLotModesByClosureDay(
  periods: InvoicePeriodsReader,
  calendar: InvoicingCalendar,
  stored: readonly StoredBatchView[],
): Promise<ReadonlyMap<string, readonly BillingMode[]>> {
  const modes = await readLotPayerModes(
    periods,
    calendar,
    stored.map((batch) => ({
      payerRefs: batch.payerRefs,
      closesAt: new Date(batch.cycleClosesAt),
    })),
  );
  return lotModesByClosureDay(stored, modes);
}

/**
 * La règle des rythmes d'une procédure (`procedureRhythms`), liée aux lots
 * de l'entité et à ses clients comptés — partagée par la liste, le détail,
 * le calendrier des rythmes et le nom des fichiers pain.008.
 */
export function procedureRhythmsOf(
  calendar: InvoicingCalendar,
  lotModes: ReadonlyMap<string, readonly BillingMode[]>,
  payerCounts: ReadonlyMap<BillingMode, number>,
): ProcedureRhythmsOf {
  return (closesAt) =>
    procedureRhythms({
      closureModes: calendar.modesClosingAt(closesAt),
      lotModes: lotModes.get(closureDayOf(closesAt)) ?? null,
      payerCounts,
    });
}

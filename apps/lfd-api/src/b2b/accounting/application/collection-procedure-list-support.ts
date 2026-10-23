import {
  instantToLocal,
  type BillingRhythmKind,
  type CollectionProcedureRowView,
} from "@lfd/contracts";

import type { StoredBatchView } from "../domain/ports/collection-batch.reader.js";
import {
  collectionCalendar,
  type CollectionCalendarSettings,
} from "../domain/services/collection-calendar.js";
import type { ProcedureBatch } from "../domain/services/collection-procedure.js";
import type {
  ClosureToCome,
  ListedBatch,
  ProcedureRow,
} from "../domain/services/collection-procedure-list.js";
import { closureDayOf } from "../domain/services/collection-procedure-id.js";
import type { InvoicingCalendar } from "../domain/services/invoicing-calendar.js";
import { closureAfter, periodLabelOf } from "../domain/services/invoicing-closures.js";
import type { ModeTimelines } from "../domain/services/payer-timeline.js";
import { BILLING_MODES, type BillingMode } from "../domain/value-objects/billing-mode.js";

/** Les lots tels que la liste les lit : ceux de la procédure, plus de quoi avertir. */
export function listedBatchesOf(
  stored: readonly StoredBatchView[],
  batches: readonly ProcedureBatch[],
  modes: readonly (readonly BillingRhythmKind[])[],
): readonly ListedBatch[] {
  return batches.flatMap((batch, index) => {
    const row = stored[index];
    return row === undefined
      ? []
      : [
          {
            ...batch,
            constitutedDay: instantToLocal(new Date(row.constitutedAt)).day,
            unmandatedCount: row.unmandatedCompanies.length,
            periodLabel: row.periodLabel,
            payerModes: modes[index] ?? [],
          },
        ];
  });
}

/** Une clôture sans lot, avec les jalons du calendrier — ceux dont le lot tirera son échéance. */
export function closureToCome(
  calendar: InvoicingCalendar,
  closesAt: Date,
  settings: CollectionCalendarSettings,
  modes: readonly BillingMode[],
): ClosureToCome {
  const milestones = collectionCalendar(closesAt, settings);
  return {
    closesAt,
    periodLabel: periodLabelOf(calendar.cycleClosedAt(closesAt)),
    modes,
    collectionDay: milestones.collectionDay,
    depositDeadline: milestones.depositDeadline,
  };
}

/**
 * La prochaine clôture de chaque rythme suivi, strictement après `now` —
 * une seule ligne quand deux rythmes closent ensemble (la fin de mois du
 * mensuel et du « deux fois par mois »).
 */
export function upcomingClosures(
  timelines: ModeTimelines,
  followed: readonly BillingMode[],
  calendar: InvoicingCalendar,
  settings: CollectionCalendarSettings,
  now: Date,
): readonly ClosureToCome[] {
  const byInstant = new Map<number, BillingMode[]>();
  for (const mode of BILLING_MODES.filter((known) => followed.includes(known))) {
    const at = closureAfter(now, timelines[mode]).getTime();
    byInstant.set(at, [...(byInstant.get(at) ?? []), mode]);
  }
  return [...byInstant].map(([at, modes]) =>
    closureToCome(calendar, new Date(at), settings, modes),
  );
}

/** Une ligne, telle que l'écran la lit. */
export function procedureRowView(
  legalEntityId: string,
  row: ProcedureRow,
): CollectionProcedureRowView {
  return {
    id: row.id,
    legalEntityId,
    closesAt: row.closesAt.toISOString(),
    closureDay: closureDayOf(row.closesAt),
    periodLabel: row.periodLabel,
    modes: row.modes,
    phase: row.phase,
    stage: row.stage,
    batches: row.batches.map((batch) => ({
      id: batch.id,
      scheme: batch.scheme,
      status: batch.status,
    })),
    followedBatchId: row.followed?.id ?? null,
    collectionDay: row.collectionDay,
    depositDeadline: row.depositDeadline,
    deposited: row.followed?.status === "deposited",
    warnings: row.warnings,
  };
}

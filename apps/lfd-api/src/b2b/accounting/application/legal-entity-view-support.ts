import type { CollectionCalendarView, LegalEntityView } from "@lfd/contracts";

import type { LastAutopilotRunReader } from "../domain/ports/last-autopilot-run.reader.js";
import type { LegalEntityRecord } from "../domain/ports/legal-entity.reader.js";
import type { RecordedClosureReader } from "../domain/ports/recorded-closure.reader.js";
import { calendarCycleAt } from "../domain/services/calendar-cycles.js";
import { InvoicingCalendar } from "../domain/services/invoicing-calendar.js";
import { entityBillingModes } from "./billing-modes-view-support.js";
import type { InvoicingCalendarReaders } from "./invoicing-calendar-support.js";
import {
  collectionCalendar,
  type CollectionCalendar,
} from "../domain/services/collection-calendar.js";

/** Ce que la fiche lit en plus de l'entité. */
export interface EntityViewReaders {
  readonly closures: RecordedClosureReader;
  readonly autopilotRuns: LastAutopilotRunReader;
  readonly modes: InvoicingCalendarReaders;
}

/**
 * Complète la fiche d'une entité par le calendrier du cycle EN COURS — celui
 * qui contient `now`, borné par sa dernière clôture enregistrée —, par les
 * dates de ses trois modes et la dernière clôture de son calendrier (M1,
 * plan `plan-rythme-de-facturation.md` §16) et par la dernière tentative de
 * l'automatisme (PA3).
 *
 * Depuis M3, `nextCollection` et `lastClosure` lisent le MÊME calendrier que
 * la facture et le lot (`InvoicingCalendar`, lu une fois ici) : la fiche
 * annonce le lot que l'automatisme préparera.
 *
 * Partagé par la fiche et la liste : deux lectures, un calcul. Le calendrier
 * vient de `collectionCalendar`, la même fonction que le fichier du lot
 * (plan `prelevement-automatique.md`, PA1).
 */
export async function withNextCollection(
  record: LegalEntityRecord,
  readers: EntityViewReaders,
  now: Date,
): Promise<LegalEntityView> {
  const [modes, payers] = await Promise.all([
    readers.modes.modeDates.timelinesOf(record.id),
    readers.modes.payerModes.segmentsOf(record.id),
  ]);
  const invoicing = InvoicingCalendar.of(modes, payers);
  const cycle = calendarCycleAt(now, invoicing, await readers.closures.lastClosure(record.id));
  const calendar = collectionCalendar(cycle.closesAt, {
    preNotificationDays: record.preNotificationDays,
    collectionDaysAfterClosure: record.collectionDaysAfterClosure,
    autoCollectionDelayHours: record.autoCollectionDelayHours,
    depositCutoff: record.depositCutoff,
  });
  const run = await readers.autopilotRuns.lastOf(record.id);
  return {
    ...record,
    ...entityBillingModes(modes, payers, invoicing, now),
    nextCollection: calendarView(calendar),
    lastAutopilotRun:
      run === null
        ? null
        : {
            cycleClosesAt: run.cycleClosesAt.toISOString(),
            ranAt: run.ranAt.toISOString(),
            outcome: run.outcome,
            message: run.message,
          },
  };
}

/** Le calendrier, tel que le contrat le porte : instants en ISO, jours tels quels. */
export function calendarView(calendar: CollectionCalendar): CollectionCalendarView {
  return {
    closesAt: calendar.closesAt.toISOString(),
    plannedConstitutionAt: calendar.plannedConstitutionAt.toISOString(),
    collectionDay: calendar.collectionDay,
    depositDeadline: calendar.depositDeadline,
  };
}

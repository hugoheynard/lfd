import type { CollectionCalendarView, LegalEntityView } from "@lfd/contracts";

import type { LastAutopilotRunReader } from "../domain/ports/last-autopilot-run.reader.js";
import type { LegalEntityRecord } from "../domain/ports/legal-entity.reader.js";
import type { RecordedClosureReader } from "../domain/ports/recorded-closure.reader.js";
import { LegalEntityNotFoundError } from "../domain/errors/accounting-errors.js";
import type { BillingRhythmReader } from "../domain/ports/billing-rhythm.reader.js";
import { entityCycleAt } from "../domain/services/entity-closures.js";
import {
  collectionCalendar,
  type CollectionCalendar,
} from "../domain/services/collection-calendar.js";

/** Ce que la fiche lit en plus de l'entité. */
export interface EntityViewReaders {
  readonly closures: RecordedClosureReader;
  readonly autopilotRuns: LastAutopilotRunReader;
  readonly rhythms: BillingRhythmReader;
}

/**
 * Complète la fiche d'une entité par le calendrier du cycle EN COURS — celui
 * qui contient `now`, au rythme de facturation de l'entité (R4), borné par sa
 * dernière clôture enregistrée — et par la dernière tentative de
 * l'automatisme (PA3).
 *
 * @throws {LegalEntityNotFoundError} l'entité a disparu entre deux lectures.
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
  const rhythm = await readers.rhythms.settingOf(record.id);
  if (rhythm === null) {
    throw new LegalEntityNotFoundError(record.id);
  }
  const cycle = entityCycleAt(now, rhythm, await readers.closures.lastClosure(record.id));
  const calendar = collectionCalendar(cycle.closesAt, {
    preNotificationDays: record.preNotificationDays,
    collectionDaysAfterClosure: record.collectionDaysAfterClosure,
    autoCollectionDelayHours: record.autoCollectionDelayHours,
    depositCutoff: record.depositCutoff,
  });
  const run = await readers.autopilotRuns.lastOf(record.id);
  return {
    ...record,
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

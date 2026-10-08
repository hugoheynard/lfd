import type { CollectionCalendarView, LegalEntityView } from "@lfd/contracts";

import type { LegalEntityRecord } from "../domain/ports/legal-entity.reader.js";
import type { RecordedClosureReader } from "../domain/ports/recorded-closure.reader.js";
import { cycleAt } from "../domain/services/billing-cycle.js";
import {
  collectionCalendar,
  type CollectionCalendar,
} from "../domain/services/collection-calendar.js";

/**
 * Complète la fiche d'une entité par le calendrier du cycle EN COURS — celui
 * qui contient `now`, borné par la dernière clôture enregistrée de l'entité.
 *
 * Partagé par la fiche et la liste : deux lectures, un calcul. Le calendrier
 * vient de `collectionCalendar`, la même fonction que le fichier du lot
 * (plan `plan-prelevement-automatique.md`, PA1).
 */
export async function withNextCollection(
  record: LegalEntityRecord,
  closures: RecordedClosureReader,
  now: Date,
): Promise<LegalEntityView> {
  const cycle = cycleAt(now, await closures.lastClosure(record.id));
  const calendar = collectionCalendar(cycle.closesAt, {
    preNotificationDays: record.preNotificationDays,
    collectionDaysAfterClosure: record.collectionDaysAfterClosure,
    autoCollectionDelayHours: record.autoCollectionDelayHours,
    depositCutoff: record.depositCutoff,
  });
  return { ...record, nextCollection: calendarView(calendar) };
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

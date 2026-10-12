import type {
  BillingRhythmChangeLockView,
  CollectionCalendarView,
  LegalEntityView,
  UpcomingClosureView,
} from "@lfd/contracts";

import type { LastAutopilotRunReader } from "../domain/ports/last-autopilot-run.reader.js";
import type { LegalEntityRecord } from "../domain/ports/legal-entity.reader.js";
import type { RecordedClosureReader } from "../domain/ports/recorded-closure.reader.js";
import { LegalEntityNotFoundError } from "../domain/errors/accounting-errors.js";
import type { BillingRhythmReader } from "../domain/ports/billing-rhythm.reader.js";
import type { InvoicedClosuresReader } from "../domain/ports/invoiced-closures.reader.js";
import { entityCycleAt, upcomingClosures } from "../domain/services/entity-closures.js";
import {
  lastDayOf,
  periodLabelOf,
  previousClosureOf,
  type RhythmTimeline,
} from "../domain/services/invoicing-closures.js";
import type { BillingRhythmSetting } from "../domain/value-objects/billing-rhythm-setting.js";
import {
  collectionCalendar,
  type CollectionCalendar,
} from "../domain/services/collection-calendar.js";

/** Ce que la fiche lit en plus de l'entité. */
export interface EntityViewReaders {
  readonly closures: RecordedClosureReader;
  readonly autopilotRuns: LastAutopilotRunReader;
  readonly rhythms: BillingRhythmReader;
  readonly invoicedClosures: InvoicedClosuresReader;
}

/** Combien de prochaines clôtures la fiche annonce (plan `plan-rythme-de-facturation.md`, §6). */
export const UPCOMING_CLOSURES_SHOWN = 3;

/**
 * Complète la fiche d'une entité par le calendrier du cycle EN COURS — celui
 * qui contient `now`, au rythme de facturation de l'entité (R4), borné par sa
 * dernière clôture enregistrée —, par ses prochaines clôtures, par l'état
 * du changement de rythme (§12 : un seul à la fois, dit AVANT le geste) et
 * par la dernière tentative de l'automatisme (PA3).
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
    billingRhythmChangeLock: await changeLockOf(record.id, rhythm, readers, now),
    upcomingClosures: upcomingClosures(now, rhythm, UPCOMING_CLOSURES_SHOWN).map((closesAt) =>
      upcomingClosureView(closesAt, rhythm),
    ),
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

/**
 * Le changement programmé est-il **en attente** ? — la même lecture que le
 * réglage (`SetBillingRhythmHandler`) : tant que sa clôture de prise d'effet
 * n'a pas été tentée par la facture, tout autre rythme est refusé (§12).
 */
async function changeLockOf(
  legalEntityId: string,
  setting: BillingRhythmSetting,
  readers: EntityViewReaders,
  now: Date,
): Promise<BillingRhythmChangeLockView | null> {
  const { scheduled } = setting;
  if (
    scheduled === null ||
    (await readers.invoicedClosures.attempted(legalEntityId, scheduled.effectiveAt))
  ) {
    return null;
  }
  return {
    effectiveAt: scheduled.effectiveAt.toISOString(),
    unlocksAfterInvoiceOn: lastDayOf(scheduled.effectiveAt),
    canCancel: now < scheduled.effectiveAt,
  };
}

function upcomingClosureView(closesAt: Date, timeline: RhythmTimeline): UpcomingClosureView {
  return {
    closesAt: closesAt.toISOString(),
    periodLabel: periodLabelOf({ startsAt: previousClosureOf(closesAt, timeline), closesAt }),
    invoicedOn: lastDayOf(closesAt),
  };
}

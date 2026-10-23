import { addDays, instantToLocal, localToInstant, weekdayOf } from "@lfd/contracts";

import { BillingCycleBoundaryError } from "../errors/accounting-errors.js";
import { collectionCalendar, type CollectionCalendarSettings } from "./collection-calendar.js";
import { closureAfter, lastDayOf, type RhythmTimeline } from "./invoicing-closures.js";

/** L'axe du tableau de bord : six semaines, de quoi voir l'échéance d'une clôture mensuelle. */
export const RHYTHM_CALENDAR_WEEKS = 6;

/**
 * Au-delà des réglages, la marge du regard en arrière : un report TARGET2
 * (Pâques, Noël) décale une échéance de quelques jours, jamais d'une semaine.
 */
const LOOKBACK_MARGIN_DAYS = 7;

/** Garde-fou de boucle : six semaines d'un rythme hebdomadaire, plus le regard en arrière. */
const MAX_PERIODS = 32;

const MONDAY = 1;
const DAYS_PER_WEEK = 7;

/** Un axe de jours locaux, `[startsOn, endsOn)`. */
export interface RhythmCalendarWindow {
  readonly startsOn: string;
  readonly endsOn: string;
}

/** Une période et ses trois jalons, en jours locaux de Paris. */
export interface RhythmPeriodMilestones {
  readonly closesAt: Date;
  readonly invoicedOn: string;
  readonly noticeOn: string;
  readonly collectionDay: string;
}

/** L'axe qui contient `now` : du lundi (Paris) de sa semaine, six semaines. */
export function rhythmCalendarWindowAt(now: Date): RhythmCalendarWindow {
  const today = instantToLocal(now).day;
  const startsOn = addDays(today, -((weekdayOf(today) - MONDAY + DAYS_PER_WEEK) % DAYS_PER_WEEK));
  return { startsOn, endsOn: addDays(startsOn, RHYTHM_CALENDAR_WEEKS * DAYS_PER_WEEK) };
}

/**
 * **Les périodes d'un rythme dont un jalon tombe sur l'axe** — facture
 * (veille de la clôture), avis (préparation prévue du lot) ou échéance.
 *
 * Aucune règle n'est refaite ici : la suite des clôtures est celle de
 * `closureAfter` sur la timeline du mode, les jalons ceux de
 * `collectionCalendar` — la fonction dont le lot tire son échéance. On part
 * assez tôt avant l'axe pour qu'une clôture passée dont l'échéance tombe
 * dedans y figure.
 *
 * Pur : ni horloge, ni port.
 */
export function rhythmPeriodsIn(
  window: RhythmCalendarWindow,
  timeline: RhythmTimeline,
  settings: CollectionCalendarSettings,
): readonly RhythmPeriodMilestones[] {
  const reach = Math.max(settings.preNotificationDays, settings.collectionDaysAfterClosure ?? 0);
  const from = addDays(window.startsOn, -(reach + LOOKBACK_MARGIN_DAYS));
  let cursor = localToInstant(from, "00:00");
  if (cursor === null) {
    throw new BillingCycleBoundaryError(from, "00:00");
  }
  const periods: RhythmPeriodMilestones[] = [];
  for (let guard = 0; guard < MAX_PERIODS; guard += 1) {
    cursor = closureAfter(cursor, timeline);
    const invoicedOn = lastDayOf(cursor);
    if (invoicedOn >= window.endsOn) {
      return periods;
    }
    const calendar = collectionCalendar(cursor, settings);
    if (calendar.collectionDay >= window.startsOn) {
      periods.push({
        closesAt: cursor,
        invoicedOn,
        noticeOn: instantToLocal(calendar.plannedConstitutionAt).day,
        collectionDay: calendar.collectionDay,
      });
    }
  }
  return periods;
}

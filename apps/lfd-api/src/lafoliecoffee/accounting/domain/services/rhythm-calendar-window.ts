import { addDays, CALENDAR_MONTH_PATTERN, instantToLocal, localToInstant } from "@lfd/contracts";

import {
  BillingCycleBoundaryError,
  InvalidCalendarMonthError,
} from "../errors/accounting-errors.js";
import {
  collectionCalendar,
  type CollectionCalendarSettings,
  type LocalDeadline,
} from "./collection-calendar.js";
import { closureAfter, lastDayOf, type RhythmTimeline } from "./invoicing-closures.js";

/**
 * Au-delà des réglages, la marge du regard en arrière : un report TARGET2
 * (Pâques, Noël) décale une échéance de quelques jours, jamais d'une semaine.
 */
const LOOKBACK_MARGIN_DAYS = 7;

/** Garde-fou de boucle : un mois d'un rythme hebdomadaire, plus le regard en arrière. */
const MAX_PERIODS = 32;

const MONTHS_PER_YEAR = 12;

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
  /** La limite de dépôt du fichier ; `null` tant que le cut-off n'est pas réglé. */
  readonly depositDeadline: LocalDeadline | null;
}

/** Le mois (`AAAA-MM`) de `now` à Paris. */
export function calendarMonthAt(now: Date): string {
  return instantToLocal(now).day.slice(0, "AAAA-MM".length);
}

/**
 * L'axe du tableau de bord : un mois calendaire, de son 1er au 1er du mois
 * suivant (exclu). Un mois se lit d'un bloc ; six semaines glissantes
 * chevauchaient deux mois sans en montrer aucun entier.
 *
 * @throws {InvalidCalendarMonthError} le mois n'est pas `AAAA-MM`.
 */
export function rhythmCalendarMonth(month: string): RhythmCalendarWindow {
  if (!CALENDAR_MONTH_PATTERN.test(month)) {
    throw new InvalidCalendarMonthError(month);
  }
  const [year, monthOfYear] = month.split("-").map(Number);
  const nextYear = (year ?? 0) + (monthOfYear === MONTHS_PER_YEAR ? 1 : 0);
  const nextMonth = ((monthOfYear ?? 1) % MONTHS_PER_YEAR) + 1;
  return {
    startsOn: `${month}-01`,
    endsOn: `${String(nextYear)}-${String(nextMonth).padStart(2, "0")}-01`,
  };
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
        depositDeadline: calendar.depositDeadline,
      });
    }
  }
  return periods;
}

import type { Recurrence } from "@lfd/contracts";

import { IsoDate } from "../value-objects/iso-date.js";

const DAY_MS = 86_400_000;
const STEP_DAYS: Readonly<Record<Exclude<Recurrence, "monthly">, number>> = {
  weekly: 7,
  biweekly: 14,
};

/** Ce que le calendrier lit d'un panier récurrent. */
export interface BasketSchedule {
  readonly cadence: Recurrence;
  readonly startDate: IsoDate;
  /** `null` : sans fin. */
  readonly endDate: IsoDate | null;
}

/**
 * **Les jours qu'un panier vise** entre `from` et `to`, bornes comprises,
 * dans l'ordre du calendrier.
 *
 * - `weekly` / `biweekly` : tous les 7 / 14 jours à partir de `startDate` ;
 * - `monthly` : le même quantième que `startDate` ; un mois qui ne l'a pas
 *   prend son dernier jour (le 31 janvier donne le 28 ou 29 février, puis le
 *   31 mars) — décidé par Hugo le 2026-11-23 ;
 * - bornés par `startDate` et `endDate`.
 *
 * Pur : ni horloge, ni statut. Il sert à CRÉER les lignes d'échéance ; ce
 * qu'il advient de chacune (sautée, passée, annulée) est porté par la ligne.
 */
export function calendarDays(
  schedule: BasketSchedule,
  from: IsoDate,
  to: IsoDate,
): readonly IsoDate[] {
  const first = from.isBefore(schedule.startDate) ? schedule.startDate : from;
  const last = schedule.endDate !== null && schedule.endDate.isBefore(to) ? schedule.endDate : to;
  if (last.isBefore(first)) {
    return [];
  }
  return calendarDates(schedule.cadence, schedule.startDate, first, last);
}

/** Les jours visés par la cadence, de `first` à `last` compris. */
function calendarDates(
  recurrence: Recurrence,
  start: IsoDate,
  first: IsoDate,
  last: IsoDate,
): readonly IsoDate[] {
  return recurrence === "monthly"
    ? monthlyDates(start, first, last)
    : steppedDates(STEP_DAYS[recurrence], start, first, last);
}

function steppedDates(
  stepDays: number,
  start: IsoDate,
  first: IsoDate,
  last: IsoDate,
): readonly IsoDate[] {
  const startMs = toMs(start);
  // Le premier pas qui ne tombe pas avant `first`, sans parcourir le passé.
  const skippedSteps = Math.ceil((toMs(first) - startMs) / DAY_MS / stepDays);
  const dates: IsoDate[] = [];
  for (
    let ms = startMs + skippedSteps * stepDays * DAY_MS;
    ms <= toMs(last);
    ms += stepDays * DAY_MS
  ) {
    dates.push(fromMs(ms));
  }
  return dates;
}

function monthlyDates(start: IsoDate, first: IsoDate, last: IsoDate): readonly IsoDate[] {
  const [startYear, startMonth, anchorDay] = parts(start);
  const [firstYear, firstMonth] = parts(first);
  const dates: IsoDate[] = [];
  // Le mois de `first` est le premier candidat : un mois plus tôt tomberait avant lui.
  for (let index = (firstYear - startYear) * 12 + (firstMonth - startMonth); ; index += 1) {
    const year = startYear + Math.floor((startMonth - 1 + index) / 12);
    const month = ((startMonth - 1 + index) % 12) + 1;
    const date = fromParts(year, month, Math.min(anchorDay, daysInMonth(year, month)));
    if (date.isAfter(last)) {
      return dates;
    }
    if (!date.isBefore(first)) {
      dates.push(date);
    }
  }
}

function parts(date: IsoDate): readonly [number, number, number] {
  const [year, month, day] = date.toString().split("-").map(Number);
  return [year ?? 0, month ?? 0, day ?? 0];
}

function daysInMonth(year: number, month: number): number {
  // Le jour 0 du mois suivant est le dernier jour de celui-ci.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function fromParts(year: number, month: number, day: number): IsoDate {
  return fromMs(Date.UTC(year, month - 1, day));
}

function toMs(date: IsoDate): number {
  return date.toUtcDate().getTime();
}

function fromMs(ms: number): IsoDate {
  return IsoDate.fromDate(new Date(ms));
}

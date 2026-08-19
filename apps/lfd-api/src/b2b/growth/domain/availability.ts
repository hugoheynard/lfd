import type {
  AvailabilityExceptionView,
  AvailabilityRuleView,
  BookingPolicy,
  Slot,
} from "@lfd/contracts";

import {
  addDays,
  addMinutes,
  instantToLocal,
  localToInstant,
  minutesOfDay,
  timeOfMinutes,
  weekdayOf,
} from "./paris-time.js";
import { mergeIntervals, subtractIntervals, type MinuteInterval } from "./minute-interval.js";

/**
 * **Le cœur de la prise de rendez-vous** : les créneaux réservables **se
 * calculent**, ils ne se stockent pas.
 *
 * ```
 * disponibilité = règles hebdo
 *               + exceptions « open »
 *               − exceptions « closed »
 *               − rendez-vous déjà pris
 *               − délai de prévenance
 *               ∩ horizon de réservation
 * ```
 *
 * Fonction **pure** et déterministe (le temps est injecté) : c'est elle que
 * lisent **à la fois** le client qui réserve et l'admin qui prévisualise — ils ne
 * peuvent donc pas afficher deux vérités. Doc :
 * `documentation/architecture-prise-de-rendez-vous.md`.
 */

/** Un créneau déjà occupé — seules ses bornes comptent ici. */
export interface BookedSlot {
  readonly startAt: Date;
  readonly endAt: Date;
}

/** La disponibilité déclarée par le commercial, telle que le domaine la lit. */
export interface AvailabilityConfig {
  readonly rules: readonly AvailabilityRuleView[];
  readonly exceptions: readonly AvailabilityExceptionView[];
  readonly policy: BookingPolicy;
}

/** La fenêtre demandée, en jours locaux inclusifs. */
export interface DayRange {
  readonly from: string;
  readonly to: string;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Garde-fou : au-delà, c'est un appel abusif, pas une fenêtre de réservation. */
const MAX_DAYS = 120;

/**
 * Les créneaux réservables de la fenêtre, triés par instant croissant.
 *
 * Les bornes de la politique sont appliquées **ici** et nulle part ailleurs :
 * un créneau rendu par cette fonction est réservable, point.
 */
export function slotsFor(
  range: DayRange,
  config: AvailabilityConfig,
  taken: readonly BookedSlot[],
  now: Date,
): Slot[] {
  const { policy } = config;
  const earliest = new Date(now.getTime() + policy.leadTimeHours * HOUR_MS);
  const latest = new Date(now.getTime() + policy.horizonDays * DAY_MS);
  const slots: Slot[] = [];
  for (const day of daysOf(range)) {
    for (const interval of openIntervalsOf(day, config)) {
      collectDaySlots(day, interval, policy.slotMinutes, slots, {
        earliest,
        latest,
        taken,
      });
    }
  }
  return slots.sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/** Les bornes qui filtrent un créneau candidat. */
interface SlotBounds {
  readonly earliest: Date;
  readonly latest: Date;
  readonly taken: readonly BookedSlot[];
}

/** Découpe un intervalle ouvert en créneaux, et ne garde que les réservables. */
function collectDaySlots(
  day: string,
  interval: MinuteInterval,
  slotMinutes: number,
  out: Slot[],
  bounds: SlotBounds,
): void {
  for (let start = interval.start; start + slotMinutes <= interval.end; start += slotMinutes) {
    const time = timeOfMinutes(start);
    const startAt = localToInstant(day, time);
    // `null` = heure locale inexistante (passage à l'heure d'été) : on saute.
    if (startAt === null) {
      continue;
    }
    const endAt = addMinutes(startAt, slotMinutes);
    if (startAt < bounds.earliest || startAt > bounds.latest) {
      continue;
    }
    if (overlapsAny(startAt, endAt, bounds.taken)) {
      continue;
    }
    out.push({ startAt: startAt.toISOString(), endAt: endAt.toISOString(), day, time });
  }
}

/**
 * Les plages ouvertes d'une journée : les règles du jour, plus les ouvertures
 * ponctuelles, moins les fermetures. Une fermeture **sans bornes** ferme la
 * journée entière — y compris une ouverture ponctuelle du même jour, qui serait
 * sinon un piège (« je suis en congés, sauf ce créneau que j'avais ouvert »).
 */
export function openIntervalsOf(day: string, config: AvailabilityConfig): MinuteInterval[] {
  const exceptions = config.exceptions.filter((e) => e.day === day);
  if (exceptions.some((e) => e.kind === "closed" && e.startTime === null)) {
    return [];
  }
  const weekday = weekdayOf(day);
  const open: MinuteInterval[] = config.rules
    .filter((rule) => rule.weekday === weekday)
    .map((rule) => toInterval(rule.startTime, rule.endTime));
  for (const exception of exceptions) {
    if (exception.kind === "open" && exception.startTime !== null && exception.endTime !== null) {
      open.push(toInterval(exception.startTime, exception.endTime));
    }
  }
  const closed: MinuteInterval[] = exceptions
    .filter((e) => e.kind === "closed" && e.startTime !== null && e.endTime !== null)
    .map((e) => toInterval(e.startTime ?? "00:00", e.endTime ?? "00:00"));
  return subtractIntervals(mergeIntervals(open), closed);
}

/** Un créneau candidat chevauche-t-il un rendez-vous déjà pris ? */
function overlapsAny(startAt: Date, endAt: Date, taken: readonly BookedSlot[]): boolean {
  return taken.some((t) => startAt < t.endAt && t.startAt < endAt);
}

/** Les jours locaux de la fenêtre, bornés — une fenêtre absurde ne coûte rien. */
function daysOf(range: DayRange): string[] {
  const days: string[] = [];
  let cursor = range.from;
  while (cursor <= range.to && days.length < MAX_DAYS) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

function toInterval(startTime: string, endTime: string): MinuteInterval {
  return { start: minutesOfDay(startTime), end: minutesOfDay(endTime) };
}

/**
 * Le créneau `startAt` est-il **exactement** l'un des créneaux réservables ?
 *
 * C'est la revalidation serveur : la liste envoyée au client a pu vieillir (une
 * plage fermée entre-temps, un rendez-vous pris). On ne fait jamais confiance à
 * l'instant reçu — on le recalcule contre la même fonction.
 */
export function isBookableSlot(
  startAt: Date,
  config: AvailabilityConfig,
  taken: readonly BookedSlot[],
  now: Date,
): boolean {
  const local = instantToLocal(startAt);
  const slots = slotsFor({ from: local.day, to: local.day }, config, taken, now);
  const iso = startAt.toISOString();
  return slots.some((slot) => slot.startAt === iso);
}

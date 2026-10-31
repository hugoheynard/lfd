import {
  clockRangeCovers,
  minutesOfDay,
  weeklyMomentOf,
  weeklyMomentOfLocal,
  type LocalMoment,
  type Weekday,
  type WeeklyMoment,
} from "@lfd/contracts";

import { PromotionInvalidHoursError } from "./errors/promotion-hours-errors.js";

/**
 * **Une promotion récurrente : jours et heures**
 * (`documentation/promotions/plan-jours-et-heures.md`, § 3, § 8 et § 11) — pur.
 *
 * La récurrence s'inscrit DANS la période de la promotion : hors période,
 * rien ; dans la période, seulement aux jours et heures dits, à la pendule de
 * Paris (`weeklyMomentOf`, le juge partagé avec les suggestions). Une plage ne
 * passe pas minuit ; les jours fériés sont ignorés (§ 11).
 */

/** L'instant jugé (Q1) : la commande, ou le début du créneau choisi. */
export type PromotionHoursMoment = "ordered_at" | "handover_at";

/** Une plage : des jours, un début compris et une fin exclue, `HH:MM`. */
export interface PromotionHoursWindow {
  readonly weekdays: readonly Weekday[];
  readonly start: string;
  readonly end: string;
}

/** La condition « jours et heures ». */
export interface PromotionWeeklyHours {
  readonly kind: "weekly_hours";
  readonly moment: PromotionHoursMoment;
  /** Hors des heures, la boutique dit-elle les heures (Q2) ? */
  readonly announceOutside: boolean;
  readonly windows: readonly PromotionHoursWindow[];
}

/**
 * Les instants qu'une admission juge : la commande (le `now` de la
 * question) et le créneau choisi, `null` sans créneau — une promotion
 * `handover_at` ne s'applique alors pas (§ 8.3).
 */
export interface PromotionMoments {
  readonly orderedAt: Date;
  readonly handoverAt: LocalMoment | null;
}

const HOUR_SHAPE = /^([01]\d|2[0-3]):[0-5]\d$/u;
/** « Jusqu'à minuit » : la seule fin qui n'est pas une heure de la journée. */
const MIDNIGHT_END = "24:00";
const WEEK: readonly Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_NAMES: Readonly<Record<Weekday, string>> = {
  mon: "lundi",
  tue: "mardi",
  wed: "mercredi",
  thu: "jeudi",
  fri: "vendredi",
  sat: "samedi",
  sun: "dimanche",
};

/**
 * **Tous les refus de la pose** : aucune plage, aucun jour, un jour nommé
 * deux fois dans une plage, une heure mal formée, une fin avant ou égale au
 * début, deux plages qui se chevauchent un même jour. Un jour peut figurer
 * dans plusieurs plages (§ 8, exemple corrigé).
 *
 * @throws {PromotionInvalidHoursError}
 */
export function assertWeeklyHours(hours: PromotionWeeklyHours): void {
  if (hours.windows.length === 0) {
    throw new PromotionInvalidHoursError("no_window");
  }
  hours.windows.forEach(assertWindow);
  for (const weekday of WEEK) {
    assertDisjoint(
      weekday,
      hours.windows.filter((window) => window.weekdays.includes(weekday)),
    );
  }
}

function assertWindow(window: PromotionHoursWindow): void {
  if (!HOUR_SHAPE.test(window.start)) {
    throw new PromotionInvalidHoursError("malformed_hour", window.start);
  }
  if (!HOUR_SHAPE.test(window.end) && window.end !== MIDNIGHT_END) {
    throw new PromotionInvalidHoursError("malformed_hour", window.end);
  }
  if (minutesOfDay(window.end) <= minutesOfDay(window.start)) {
    throw new PromotionInvalidHoursError("reversed", rangePhrase(window));
  }
  if (window.weekdays.length === 0) {
    throw new PromotionInvalidHoursError("no_weekday", rangePhrase(window));
  }
  const repeated = window.weekdays.find((day, index) => window.weekdays.indexOf(day) !== index);
  if (repeated !== undefined) {
    throw new PromotionInvalidHoursError(
      "duplicate_weekday",
      `${rangePhrase(window)} nomme deux fois le ${DAY_NAMES[repeated]}`,
    );
  }
}

function assertDisjoint(weekday: Weekday, windows: readonly PromotionHoursWindow[]): void {
  const sorted = [...windows].sort((a, b) => minutesOfDay(a.start) - minutesOfDay(b.start));
  sorted.forEach((window, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined && minutesOfDay(window.start) < minutesOfDay(previous.end)) {
      throw new PromotionInvalidHoursError(
        "overlap",
        `Le ${DAY_NAMES[weekday]}, les plages ${rangePhrase(previous)} et ${rangePhrase(window)}`,
      );
    }
  });
}

/** Ce moment de la semaine est-il dans l'une des plages ? */
export function weeklyHoursCover(hours: PromotionWeeklyHours, moment: WeeklyMoment): boolean {
  return hours.windows.some(
    (window) => window.weekdays.includes(moment.weekday) && clockRangeCovers(window, moment.time),
  );
}

/**
 * **L'évaluateur** : la condition admet-elle ces instants ? `ordered_at`
 * juge la commande ; `handover_at` le créneau — sans créneau, non.
 */
export function weeklyHoursAdmit(hours: PromotionWeeklyHours, moments: PromotionMoments): boolean {
  if (hours.moment === "ordered_at") {
    return weeklyHoursCover(hours, weeklyMomentOf(moments.orderedAt));
  }
  return (
    moments.handoverAt !== null && weeklyHoursCover(hours, weeklyMomentOfLocal(moments.handoverAt))
  );
}

/**
 * **Deux promotions à heures peuvent-elles valoir pour une même commande ?**
 * Sans heures d'un côté, oui. Même instant jugé : seules des plages qui se
 * croisent un même jour. Instants différents : dès que leurs jours se
 * croisent — une commande à 17 h 30 pour un retrait à 8 h satisfait les deux
 * (§ 8, « Recouvrement »).
 */
export function weeklyHoursMeet(
  left: PromotionWeeklyHours | null,
  right: PromotionWeeklyHours | null,
): boolean {
  if (left === null || right === null) {
    return true;
  }
  return left.windows.some((mine) =>
    right.windows.some((theirs) => {
      const sameDay = mine.weekdays.some((day) => theirs.weekdays.includes(day));
      return sameDay && (left.moment !== right.moment || rangesCross(mine, theirs));
    }),
  );
}

function rangesCross(left: PromotionHoursWindow, right: PromotionHoursWindow): boolean {
  return (
    minutesOfDay(left.start) < minutesOfDay(right.end) &&
    minutesOfDay(right.start) < minutesOfDay(left.end)
  );
}

/**
 * **L'heure où la remise a pris fin aujourd'hui**, `HH:MM`, ou `null` : la
 * plus tardive des plages du jour déjà finies à cet instant. `ordered_at`
 * seulement — un créneau ne « finit » pas pendant qu'on regarde le panier.
 */
export function weeklyHoursEndedAt(hours: PromotionWeeklyHours, at: Date): string | null {
  if (hours.moment !== "ordered_at") {
    return null;
  }
  const now = weeklyMomentOf(at);
  const ended = hours.windows
    .filter(
      (window) =>
        window.weekdays.includes(now.weekday) && minutesOfDay(window.end) <= minutesOfDay(now.time),
    )
    .map((window) => window.end)
    .sort((a, b) => minutesOfDay(b) - minutesOfDay(a));
  return ended[0] ?? null;
}

/**
 * **Ce que la boutique peut en dire maintenant** (§ 8, « Annonce ») :
 * `active` — commandée maintenant, la remise vaut ; `shown_outside` — hors de
 * ses heures (ou jugée au créneau), elle dit ses heures ; `silent` — elle se
 * tait. Jamais présentée comme active hors de ses heures.
 */
export type WeeklyHoursStanding = "active" | "shown_outside" | "silent";

export function weeklyHoursStanding(hours: PromotionWeeklyHours, at: Date): WeeklyHoursStanding {
  if (hours.moment === "ordered_at" && weeklyHoursCover(hours, weeklyMomentOf(at))) {
    return "active";
  }
  return hours.announceOutside ? "shown_outside" : "silent";
}

/** « 17 h », « 7 h 30 », « minuit » pour une fin à 24:00. */
export function hourPhrase(time: string): string {
  if (time === MIDNIGHT_END) {
    return "minuit";
  }
  const minutes = minutesOfDay(time);
  const hour = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${String(hour)} h` : `${String(hour)} h ${String(rest).padStart(2, "0")}`;
}

/** « de 17 h à 19 h ». */
export function rangePhrase(window: Pick<PromotionHoursWindow, "start" | "end">): string {
  return `de ${hourPhrase(window.start)} à ${hourPhrase(window.end)}`;
}

/** « tous les jours », « le mardi et le jeudi », dans l'ordre de la semaine. */
function daysPhrase(weekdays: readonly Weekday[]): string {
  const days = WEEK.filter((day) => weekdays.includes(day));
  if (days.length === WEEK.length) {
    return "tous les jours";
  }
  const names = days.map((day) => `le ${DAY_NAMES[day]}`);
  const last = names.pop();
  return names.length === 0 ? (last ?? "") : `${names.join(", ")} et ${last ?? ""}`;
}

/** « tous les jours de 17 h à 19 h ; le lundi de 7 h à 9 h ». */
export function schedulePhrase(hours: PromotionWeeklyHours): string {
  return hours.windows
    .map((window) => `${daysPhrase(window.weekdays)} ${rangePhrase(window)}`)
    .join(" ; ");
}

/** La phrase du journal : l'instant jugé, les jours et heures, l'annonce. */
export function describeWeeklyHours(hours: PromotionWeeklyHours): string {
  const moment = hours.moment === "ordered_at" ? "commandé" : "retiré ou livré";
  const announce = hours.announceOutside ? ", heures annoncées hors plage" : "";
  return `${moment} ${schedulePhrase(hours)}${announce}`;
}

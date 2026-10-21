import { localToInstant, type ProductionForecastDayState } from "@lfd/contracts";

import type { AttemptTrace } from "../auto-close-round.js";
import {
  forecastDayState,
  type ForecastDayFacts,
  type HouseMoment,
} from "../forecast-day-state.js";

/** Les dates sont le SUJET : comparées à un instant fixé, jamais à l'horloge. */
const YESTERDAY = "2026-10-05";
const TODAY = "2026-10-06";
const TOMORROW = "2026-10-07";
const LATER = "2026-10-09";

const MINUTE = 60 * 1000;

function paris(time: string, date = TODAY): Date {
  const instant = localToInstant(date, time);
  if (instant === null) {
    throw new TypeError(`heure locale inexistante : ${date} ${time}`);
  }
  return instant;
}

function moment(time: string): HouseMoment {
  return { today: TODAY, now: paris(time) };
}

/** Par défaut, l'arrêt de la journée tombe la veille à 21:00. */
function day(date: string, facts: Partial<ForecastDayFacts> = {}): ForecastDayFacts {
  const eve = date === TOMORROW ? TODAY : date === TODAY ? YESTERDAY : date;
  return {
    date,
    planClosed: false,
    orderCount: 0,
    isClosedDay: false,
    attempt: null,
    closesAt: paris("21:00", eve),
    ...facts,
  };
}

function attempt(outcome: AttemptTrace["outcome"], at: Date, minutesAgo: number): AttemptTrace {
  return { outcome, attemptedAt: new Date(at.getTime() - minutesAgo * MINUTE) };
}

describe("l'état d'une journée du prévisionnel", () => {
  it.each<[string, ForecastDayFacts, HouseMoment, ProductionForecastDayState]>([
    ["hier, même arrêté", day(YESTERDAY, { planClosed: true }), moment("10:00"), "past"],
    ["hier, ouvert avec commandes", day(YESTERDAY, { orderCount: 3 }), moment("10:00"), "past"],
    [
      "aujourd'hui arrêté",
      day(TODAY, { planClosed: true, orderCount: 3 }),
      moment("10:00"),
      "closed",
    ],
    [
      "aujourd'hui ouvert avec commandes",
      day(TODAY, { orderCount: 3 }),
      moment("06:00"),
      "overdue",
    ],
    ["aujourd'hui ouvert sans commande", day(TODAY), moment("06:00"), "open"],
    [
      "aujourd'hui fermé avec commandes",
      day(TODAY, { orderCount: 2, isClosedDay: true }),
      moment("06:00"),
      "overdue",
    ],
    [
      "aujourd'hui fermé sans commande",
      day(TODAY, { isClosedDay: true }),
      moment("06:00"),
      "closedDay",
    ],
    ["demain, avant l'arrêt", day(TOMORROW, { orderCount: 3 }), moment("20:59"), "open"],
    [
      "demain, arrêt passé, non arrêté",
      day(TOMORROW, { orderCount: 3 }),
      moment("21:00"),
      "overdue",
    ],
    ["demain, vide", day(TOMORROW), moment("22:00"), "open"],
    [
      "demain, sans heure limite posée",
      day(TOMORROW, { orderCount: 3, closesAt: null }),
      moment("23:00"),
      "open",
    ],
    [
      "demain, fermé",
      day(TOMORROW, { orderCount: 3, isClosedDay: true }),
      moment("22:00"),
      "closedDay",
    ],
    [
      "demain, arrêté",
      day(TOMORROW, { orderCount: 3, planClosed: true }),
      moment("22:00"),
      "closed",
    ],
    [
      "demain, arrêt automatique échoué",
      day(TOMORROW, { orderCount: 3, attempt: attempt("failed", paris("21:02"), 2) }),
      moment("21:02"),
      "overdue",
    ],
    [
      "demain, en suspens depuis 10 min",
      day(TOMORROW, { attempt: attempt("pending", paris("21:10"), 10) }),
      moment("21:10"),
      "open",
    ],
    [
      "demain, en suspens depuis 16 min",
      day(TOMORROW, { attempt: attempt("pending", paris("21:16"), 16) }),
      moment("21:16"),
      "overdue",
    ],
    [
      "demain, vide (rien à arrêter)",
      day(TOMORROW, { attempt: attempt("empty", paris("21:30"), 30) }),
      moment("21:30"),
      "open",
    ],
    [
      "aujourd'hui, arrêt à 00:30 (rattrapage passé minuit), pas encore",
      day(TODAY, { orderCount: 3, closesAt: paris("00:30") }),
      moment("00:20"),
      "open",
    ],
    [
      "aujourd'hui, arrêt à 00:30 passé, non arrêté",
      day(TODAY, { orderCount: 3, closesAt: paris("00:30") }),
      moment("00:40"),
      "overdue",
    ],
    [
      "plus tard, avec commandes, heure passée",
      day(LATER, { orderCount: 9 }),
      moment("22:00"),
      "open",
    ],
    ["plus tard, fermé", day(LATER, { isClosedDay: true }), moment("22:00"), "closedDay"],
  ])("%s → %s", (_case, facts, at, expected) => {
    expect(forecastDayState(facts, at)).toBe(expected);
  });
});

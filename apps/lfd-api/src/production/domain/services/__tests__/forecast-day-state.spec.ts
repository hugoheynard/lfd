import type { ProductionForecastDayState } from "@lfd/contracts";

import type { CloseSettingsValues } from "../../entities/production-close-settings.js";
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

const NOW = new Date(Date.UTC(2026, 9, 6, 19, 30));
const MINUTE = 60 * 1000;

const MANUAL: CloseSettingsValues = { mode: "manual", closeAt: null, alertAt: "20:00" };
const AUTO: CloseSettingsValues = { mode: "auto", closeAt: "21:00", alertAt: null };

function moment(time: string, settings: CloseSettingsValues = MANUAL): HouseMoment {
  return { today: TODAY, time, now: NOW, settings };
}

function day(date: string, facts: Partial<ForecastDayFacts> = {}): ForecastDayFacts {
  return { date, planClosed: false, orderCount: 0, isClosedDay: false, attempt: null, ...facts };
}

function attempt(outcome: AttemptTrace["outcome"], minutesAgo: number): AttemptTrace {
  return { outcome, attemptedAt: new Date(NOW.getTime() - minutesAgo * MINUTE) };
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
    ["demain, manuel, avant l'alerte", day(TOMORROW, { orderCount: 3 }), moment("19:59"), "open"],
    ["demain, manuel, à l'alerte", day(TOMORROW, { orderCount: 3 }), moment("20:00"), "overdue"],
    ["demain, manuel, vide", day(TOMORROW), moment("22:00"), "open"],
    [
      "demain, manuel, fermé",
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
      "demain, auto, avant l'arrêt",
      day(TOMORROW, { orderCount: 3 }),
      moment("20:30", AUTO),
      "open",
    ],
    ["demain, auto, à l'arrêt", day(TOMORROW, { orderCount: 3 }), moment("21:00", AUTO), "overdue"],
    [
      "demain, auto échoué",
      day(TOMORROW, { orderCount: 3, attempt: attempt("failed", 2) }),
      moment("21:02", AUTO),
      "overdue",
    ],
    [
      "demain, auto en suspens depuis 10 min",
      day(TOMORROW, { attempt: attempt("pending", 10) }),
      moment("20:40", AUTO),
      "open",
    ],
    [
      "demain, auto en suspens depuis 16 min",
      day(TOMORROW, { attempt: attempt("pending", 16) }),
      moment("20:40", AUTO),
      "overdue",
    ],
    [
      "demain, auto vide (rien à arrêter)",
      day(TOMORROW, { attempt: attempt("empty", 30) }),
      moment("21:30", AUTO),
      "open",
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

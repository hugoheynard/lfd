import type { CloseSettingsValues } from "../../entities/production-close-settings.js";
import {
  attemptNeedsHand,
  attemptStalled,
  frenchDayLabel,
  STALLED_ATTEMPT_AFTER_MS,
  todayNeedsCatchUp,
  tomorrowStep,
  type AttemptTrace,
  type TomorrowState,
  type TomorrowStep,
} from "../auto-close-round.js";

const AUTO: CloseSettingsValues = { mode: "auto", closeAt: "21:00", alertAt: "20:00" };
const MANUAL: CloseSettingsValues = { mode: "manual", closeAt: "21:00", alertAt: "20:00" };

const OPEN: TomorrowState = { isClosedDay: false, isPlanClosed: false, attempt: null };

/** L'instant du tour ; les tentatives se datent relativement à lui. */
const NOW = new Date(Date.UTC(2026, 9, 6, 19, 30));
const MINUTE = 60 * 1000;

function attempt(outcome: AttemptTrace["outcome"], minutesAgo: number): AttemptTrace {
  return { outcome, attemptedAt: new Date(NOW.getTime() - minutesAgo * MINUTE) };
}

const TRIED = attempt("closed", 5);

describe("le pas du tour pour le lendemain", () => {
  it.each<[string, CloseSettingsValues, string, TomorrowState, TomorrowStep]>([
    ["auto, avant l'heure", AUTO, "20:59", OPEN, "nothing"],
    ["auto, à l'heure pile", AUTO, "21:00", OPEN, "attempt_close"],
    ["auto, après l'heure", AUTO, "23:58", OPEN, "attempt_close"],
    ["auto, déjà tenté", AUTO, "21:05", { ...OPEN, attempt: TRIED }, "nothing"],
    [
      "auto, en suspens depuis 10 min",
      AUTO,
      "21:10",
      { ...OPEN, attempt: attempt("pending", 10) },
      "nothing",
    ],
    [
      "auto, en suspens depuis 16 min",
      AUTO,
      "21:16",
      { ...OPEN, attempt: attempt("pending", 16) },
      "alert_stalled",
    ],
    [
      "auto, en suspens mais arrêté entre-temps",
      AUTO,
      "21:16",
      { ...OPEN, isPlanClosed: true, attempt: attempt("pending", 16) },
      "nothing",
    ],
    [
      "auto, échoué : déjà alerté par la tentative",
      AUTO,
      "21:16",
      { ...OPEN, attempt: attempt("failed", 16) },
      "nothing",
    ],
    [
      "manuel, en suspens depuis 16 min (passé d'auto à manuel)",
      MANUAL,
      "21:16",
      { ...OPEN, attempt: attempt("pending", 16) },
      "alert_stalled",
    ],
    [
      "auto, déjà arrêté (arrêt anticipé)",
      AUTO,
      "21:05",
      { ...OPEN, isPlanClosed: true },
      "nothing",
    ],
    ["auto, jour fermé", AUTO, "21:05", { ...OPEN, isClosedDay: true }, "nothing"],
    ["auto, l'heure d'alerte ne compte pas", AUTO, "20:30", OPEN, "nothing"],
    ["manuel, avant l'alerte", MANUAL, "19:59", OPEN, "nothing"],
    ["manuel, à l'alerte", MANUAL, "20:00", OPEN, "alert_if_orders"],
    [
      "manuel, après l'alerte, déjà tenté n'y change rien",
      MANUAL,
      "22:00",
      { ...OPEN, attempt: TRIED },
      "alert_if_orders",
    ],
    ["manuel, déjà arrêté", MANUAL, "22:00", { ...OPEN, isPlanClosed: true }, "nothing"],
    ["manuel, jour fermé", MANUAL, "22:00", { ...OPEN, isClosedDay: true }, "nothing"],
    ["manuel, jamais d'arrêt même après l'heure d'arrêt", MANUAL, "21:30", OPEN, "alert_if_orders"],
  ])("%s", (_case, settings, time, state, expected) => {
    expect(tomorrowStep(settings, { time, now: NOW }, state)).toBe(expected);
  });

  it("une heure absente n'est jamais atteinte", () => {
    const late = { time: "23:59", now: NOW };
    expect(tomorrowStep({ mode: "auto", closeAt: null, alertAt: "20:00" }, late, OPEN)).toBe(
      "nothing",
    );
    expect(tomorrowStep({ mode: "manual", closeAt: "21:00", alertAt: null }, late, OPEN)).toBe(
      "nothing",
    );
  });
});

describe("la tentative en suspens (Q8)", () => {
  it("le seuil est de quinze minutes, strictement dépassé", () => {
    expect(STALLED_ATTEMPT_AFTER_MS).toBe(15 * MINUTE);
    expect(attemptStalled(attempt("pending", 15), NOW)).toBe(false);
    expect(attemptStalled(attempt("pending", 15.01), NOW)).toBe(true);
  });

  it.each<[AttemptTrace["outcome"], number, boolean]>([
    ["pending", 5, false],
    ["pending", 20, true],
    ["failed", 1, true],
    ["closed", 60, false],
    ["empty", 60, false],
  ])("%s depuis %d min → à reprendre à la main : %s", (outcome, minutes, expected) => {
    expect(attemptNeedsHand(attempt(outcome, minutes), NOW)).toBe(expected);
  });
});

describe("le rattrapage d'aujourd'hui (S4)", () => {
  it.each<[string, boolean, number, boolean]>([
    ["ouvert, avec commandes", false, 3, true],
    ["ouvert, sans commande", false, 0, false],
    ["arrêté", true, 3, false],
  ])("%s", (_case, closed, orders, expected) => {
    expect(todayNeedsCatchUp(closed, orders)).toBe(expected);
  });
});

describe("la journée dite en français", () => {
  it.each([
    ["2026-10-07", "mercredi 7 octobre"],
    ["2026-02-01", "dimanche 1er février"],
    ["2026-08-15", "samedi 15 août"],
  ])("%s → %s", (day, label) => {
    expect(frenchDayLabel(day)).toBe(label);
  });
});

import { localToInstant } from "@lfd/contracts";

import {
  attemptNeedsHand,
  attemptStalled,
  closeDue,
  closeStep,
  closesOnItsOwnDay,
  frenchDayLabel,
  STALLED_ATTEMPT_AFTER_MS,
  todayNeedsCatchUp,
  type AttemptTrace,
  type CloseStep,
  type PendingDayState,
} from "../auto-close-round.js";

const OPEN: PendingDayState = { isClosedDay: false, isPlanClosed: false, attempt: null };

/** Les dates sont le SUJET : comparées à un instant fixé, jamais à l'horloge. */
const TODAY = "2026-10-06";

function paris(time: string, day = TODAY): Date {
  const instant = localToInstant(day, time);
  if (instant === null) {
    throw new TypeError(`heure locale inexistante : ${day} ${time}`);
  }
  return instant;
}

/** L'instant du tour ; les tentatives se datent relativement à lui. */
const NOW = paris("21:30");
const MINUTE = 60 * 1000;

function attempt(outcome: AttemptTrace["outcome"], minutesAgo: number): AttemptTrace {
  return { outcome, attemptedAt: new Date(NOW.getTime() - minutesAgo * MINUTE) };
}

const TRIED = attempt("closed", 5);

describe("le pas du tour pour une journée (heure limite générale, 2026-10-21)", () => {
  it.each<[string, Date | null, PendingDayState, CloseStep]>([
    ["avant l'instant d'arrêt", paris("21:31"), OPEN, "nothing"],
    ["à l'instant pile", paris("21:30"), OPEN, "attempt_close"],
    ["après l'instant", paris("18:00"), OPEN, "attempt_close"],
    ["sans heure limite posée", null, OPEN, "nothing"],
    ["déjà tenté", paris("21:00"), { ...OPEN, attempt: TRIED }, "nothing"],
    [
      "en suspens depuis 10 min",
      paris("21:00"),
      { ...OPEN, attempt: attempt("pending", 10) },
      "nothing",
    ],
    [
      "en suspens depuis 16 min",
      paris("21:00"),
      { ...OPEN, attempt: attempt("pending", 16) },
      "alert_stalled",
    ],
    [
      "en suspens mais arrêté entre-temps",
      paris("21:00"),
      { ...OPEN, isPlanClosed: true, attempt: attempt("pending", 16) },
      "nothing",
    ],
    [
      "échoué : déjà alerté par la tentative",
      paris("21:00"),
      { ...OPEN, attempt: attempt("failed", 16) },
      "nothing",
    ],
    ["déjà arrêté", paris("21:00"), { ...OPEN, isPlanClosed: true }, "nothing"],
    ["jour fermé", paris("21:00"), { ...OPEN, isClosedDay: true }, "nothing"],
  ])("%s", (_case, closesAt, state, expected) => {
    expect(closeStep(closesAt, NOW, state)).toBe(expected);
  });
});

describe("closeDue — le seuil partagé du tour, du prévisionnel et du refus", () => {
  it("vrai à l'instant et après, faux avant ; jamais sans instant", () => {
    expect(closeDue(paris("21:30"), NOW)).toBe(true);
    expect(closeDue(paris("21:29"), NOW)).toBe(true);
    expect(closeDue(paris("21:31"), NOW)).toBe(false);
    expect(closeDue(null, NOW)).toBe(false);
  });
});

describe("closesOnItsOwnDay — l'arrêt d'aujourd'hui tombe-t-il aujourd'hui ?", () => {
  it("oui pour un rattrapage qui passe minuit, non pour un arrêt de la veille", () => {
    expect(closesOnItsOwnDay(paris("00:30"), TODAY)).toBe(true);
    expect(closesOnItsOwnDay(paris("23:00", "2026-10-05"), TODAY)).toBe(false);
    expect(closesOnItsOwnDay(null, TODAY)).toBe(false);
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

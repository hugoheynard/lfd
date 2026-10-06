import type { CloseSettingsValues } from "../../entities/production-close-settings.js";
import {
  frenchDayLabel,
  todayNeedsCatchUp,
  tomorrowStep,
  type TomorrowState,
  type TomorrowStep,
} from "../auto-close-round.js";

const AUTO: CloseSettingsValues = { mode: "auto", closeAt: "21:00", alertAt: "20:00" };
const MANUAL: CloseSettingsValues = { mode: "manual", closeAt: "21:00", alertAt: "20:00" };

const OPEN: TomorrowState = { isClosedDay: false, isPlanClosed: false, attempted: false };

describe("le pas du tour pour le lendemain", () => {
  it.each<[string, CloseSettingsValues, string, TomorrowState, TomorrowStep]>([
    ["auto, avant l'heure", AUTO, "20:59", OPEN, "nothing"],
    ["auto, à l'heure pile", AUTO, "21:00", OPEN, "attempt_close"],
    ["auto, après l'heure", AUTO, "23:58", OPEN, "attempt_close"],
    ["auto, déjà tenté", AUTO, "21:05", { ...OPEN, attempted: true }, "nothing"],
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
      { ...OPEN, attempted: true },
      "alert_if_orders",
    ],
    ["manuel, déjà arrêté", MANUAL, "22:00", { ...OPEN, isPlanClosed: true }, "nothing"],
    ["manuel, jour fermé", MANUAL, "22:00", { ...OPEN, isClosedDay: true }, "nothing"],
    ["manuel, jamais d'arrêt même après l'heure d'arrêt", MANUAL, "21:30", OPEN, "alert_if_orders"],
  ])("%s", (_case, settings, time, state, expected) => {
    expect(tomorrowStep(settings, time, state)).toBe(expected);
  });

  it("une heure absente n'est jamais atteinte", () => {
    expect(tomorrowStep({ mode: "auto", closeAt: null, alertAt: "20:00" }, "23:59", OPEN)).toBe(
      "nothing",
    );
    expect(tomorrowStep({ mode: "manual", closeAt: "21:00", alertAt: null }, "23:59", OPEN)).toBe(
      "nothing",
    );
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

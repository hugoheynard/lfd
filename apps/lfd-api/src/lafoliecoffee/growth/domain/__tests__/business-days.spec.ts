import { businessDaysBetween } from "../business-days.js";

// Les jours ne sont comparés qu'entre eux, jamais à l'horloge : le vendredi
// 13 novembre 2026 et ses suivants servent de calendrier fixe.
const FRIDAY_EVENING = new Date("2026-11-13T18:00:00.000Z");
const at = (day: string, time = "09:00:00"): Date => new Date(`${day}T${time}.000Z`);

describe("businessDaysBetween — les jours ouvrés écoulés, à Paris", () => {
  it("ne compte ni le samedi ni le dimanche", () => {
    expect(businessDaysBetween(FRIDAY_EVENING, at("2026-11-14"))).toBe(0);
    expect(businessDaysBetween(FRIDAY_EVENING, at("2026-11-15"))).toBe(0);
  });

  it("compte le lundi, puis le mardi, après un vendredi", () => {
    expect(businessDaysBetween(FRIDAY_EVENING, at("2026-11-16"))).toBe(1);
    expect(businessDaysBetween(FRIDAY_EVENING, at("2026-11-17"))).toBe(2);
    expect(businessDaysBetween(FRIDAY_EVENING, at("2026-11-18"))).toBe(3);
  });

  it("ne compte pas le jour même", () => {
    expect(businessDaysBetween(at("2026-11-16"), at("2026-11-16", "20:00:00"))).toBe(0);
  });

  it("lit le jour de Paris, pas le jour UTC", () => {
    // 23 h 30 UTC le dimanche est déjà lundi à Paris : le lundi est le jour de départ.
    const sundayLateUtc = at("2026-11-15", "23:30:00");
    expect(businessDaysBetween(sundayLateUtc, at("2026-11-17"))).toBe(1);
  });

  it("vaut zéro quand la fin précède le début", () => {
    expect(businessDaysBetween(at("2026-11-18"), at("2026-11-16"))).toBe(0);
  });
});

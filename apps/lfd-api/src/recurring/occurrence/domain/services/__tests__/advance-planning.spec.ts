import { day, openBasket } from "../../../../basket/domain/entities/__tests__/basket-fixtures.js";
import { advancePlan } from "../advance-planning.js";

const AT = new Date(0);

function ids(): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `occ_${String(next)}`;
  };
}

describe("advancePlan — la création à l'avance sur huit semaines (Q-B3)", () => {
  it("crée chaque jour de la cadence d'aujourd'hui à aujourd'hui + 56 jours, et avance jusque-là", () => {
    const plan = advancePlan({
      basket: openBasket({ startDate: day("2026-11-02") }),
      existingDays: new Set(),
      today: day("2026-11-04"),
      at: AT,
      nextId: ids(),
    });
    const days = plan.created.map((occurrence) => occurrence.serviceDay.toString());
    expect(days[0]).toBe("2026-11-09");
    expect(days.at(-1)).toBe("2026-12-28");
    expect(days).toHaveLength(8);
    expect(plan.through?.toString()).toBe("2026-12-30");
  });

  it("commence au début du panier quand il est à venir", () => {
    const plan = advancePlan({
      basket: openBasket({ startDate: day("2026-12-07") }),
      existingDays: new Set(),
      today: day("2026-11-04"),
      at: AT,
      nextId: ids(),
    });
    expect(plan.created[0]?.serviceDay.toString()).toBe("2026-12-07");
  });

  it("ne recrée pas un jour qui a déjà sa ligne, quel que soit son état", () => {
    const plan = advancePlan({
      basket: openBasket({ startDate: day("2026-11-02") }),
      existingDays: new Set(["2026-11-09", "2026-11-16"]),
      today: day("2026-11-04"),
      at: AT,
      nextId: ids(),
    });
    expect(plan.created.map((occurrence) => occurrence.serviceDay.toString())).not.toContain(
      "2026-11-09",
    );
    expect(plan.created).toHaveLength(6);
  });

  it("un panier perso ou en pause ne reçoit rien", () => {
    const paused = openBasket();
    paused.pause();
    for (const basket of [openBasket({ companyId: null }), paused]) {
      const plan = advancePlan({
        basket,
        existingDays: new Set(),
        today: day("2026-11-04"),
        at: AT,
        nextId: ids(),
      });
      expect(plan).toEqual({ created: [], through: null });
    }
  });

  it("s'arrête à la fin du panier", () => {
    const plan = advancePlan({
      basket: openBasket({ startDate: day("2026-11-02"), endDate: day("2026-11-20") }),
      existingDays: new Set(),
      today: day("2026-11-04"),
      at: AT,
      nextId: ids(),
    });
    expect(plan.created.map((occurrence) => occurrence.serviceDay.toString())).toEqual([
      "2026-11-09",
      "2026-11-16",
    ]);
  });
});

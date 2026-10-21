import { GeneralOrderCutoffRule, type GeneralOrderCutoffRequest } from "../general-order-cutoff.js";
import { OrderCutoffScopeRetiredError } from "../order-cutoff-errors.js";

const VEILLE_23H: GeneralOrderCutoffRequest = {
  pickupAddressId: null,
  weekday: null,
  daysBefore: 1,
  time: "23:00",
  graceMinutes: 30,
};

/**
 * Décision de Hugo du 2026-10-21 (`limites-de-commande/schema-des-reglages.md`
 * §4, point 4) : les règles par point de retrait × jour de semaine sont
 * retirées ; il ne reste que la générale.
 */
describe("GeneralOrderCutoffRule", () => {
  it("se pose sans point ni jour, et ne garde que délai, heure et rattrapage", () => {
    const rule = GeneralOrderCutoffRule.define("c1", VEILLE_23H);

    expect(rule.id).toBe("c1");
    expect(rule.terms).toEqual({ daysBefore: 1, time: "23:00", graceMinutes: 30 });
  });

  it("refuse un point de retrait, en nommant le geste qui reste", () => {
    expect(() =>
      GeneralOrderCutoffRule.define("c1", { ...VEILLE_23H, pickupAddressId: "labo" }),
    ).toThrow(OrderCutoffScopeRetiredError);
    expect(() =>
      GeneralOrderCutoffRule.define("c1", { ...VEILLE_23H, pickupAddressId: "labo" }),
    ).toThrow(/Réglages › Commandes › Heure limite/u);
  });

  it("refuse un jour de semaine", () => {
    expect(() => GeneralOrderCutoffRule.define("c1", { ...VEILLE_23H, weekday: "sun" })).toThrow(
      OrderCutoffScopeRetiredError,
    );
  });

  it("se règle autrement en gardant son identifiant", () => {
    const rule = GeneralOrderCutoffRule.rehydrate("c1", {
      daysBefore: 1,
      time: "18:00",
      graceMinutes: 0,
    }).redefine(VEILLE_23H);

    expect(rule.id).toBe("c1");
    expect(rule.terms.time).toBe("23:00");
  });

  it("refuse aussi à la modification un point ou un jour", () => {
    const rule = GeneralOrderCutoffRule.define("c1", VEILLE_23H);

    expect(() => rule.redefine({ ...VEILLE_23H, weekday: "mon" })).toThrow(
      OrderCutoffScopeRetiredError,
    );
  });
});

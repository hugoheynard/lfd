import { isStricterOrderLimit, shownItemOrderLimit } from "../item-order-limit.js";
import type { OrderCutoffView } from "../order-cutoff.js";

function rule(over: Partial<OrderCutoffView> = {}): OrderCutoffView {
  return {
    id: "general",
    pickupAddressId: null,
    pickupLabel: null,
    weekday: null,
    daysBefore: 1,
    time: "23:00",
    graceMinutes: 0,
    ...over,
  };
}

const EVE_23 = { daysBefore: 1, time: "23:00" };

describe("isStricterOrderLimit — l'instant limite tombe plus tôt pour un même jour", () => {
  it("deux jours avant à 12 h est plus strict que la veille à 23 h", () => {
    expect(isStricterOrderLimit({ daysBefore: 2, time: "12:00" }, EVE_23)).toBe(true);
  });

  it("la veille à 18 h est plus strict que la veille à 23 h", () => {
    expect(isStricterOrderLimit({ daysBefore: 1, time: "18:00" }, EVE_23)).toBe(true);
  });

  it("le jour même à 9 h ne l'est pas : il tombe après la veille", () => {
    expect(isStricterOrderLimit({ daysBefore: 0, time: "09:00" }, EVE_23)).toBe(false);
  });

  it("à égalité, non : l'article ne dit rien de plus que la boutique", () => {
    expect(isStricterOrderLimit(EVE_23, EVE_23)).toBe(false);
  });

  it("deux jours avant à 23 h 30 l'emporte sur la veille à 0 h 10", () => {
    expect(
      isStricterOrderLimit({ daysBefore: 2, time: "23:30" }, { daysBefore: 1, time: "00:10" }),
    ).toBe(true);
  });

  it("sans règle générale, toute limite d'article est plus stricte", () => {
    expect(isStricterOrderLimit({ daysBefore: 0, time: "09:00" }, null)).toBe(true);
  });
});

describe("shownItemOrderLimit — ce que la fiche montre", () => {
  it("rend la limite plus stricte, sans la grâce", () => {
    expect(
      shownItemOrderLimit({ daysBefore: 2, time: "12:00", graceMinutes: 30 } as const, [rule()]),
    ).toEqual({ daysBefore: 2, time: "12:00" });
  });

  it("tait une limite qui ne l'est pas", () => {
    expect(shownItemOrderLimit({ daysBefore: 1, time: "23:00" }, [rule()])).toBeNull();
  });

  it("rend null sans limite d'article", () => {
    expect(shownItemOrderLimit(null, [rule()])).toBeNull();
  });

  it("montre toute limite quand l'heure limite générale est désactivée (aucune règle)", () => {
    expect(shownItemOrderLimit({ daysBefore: 0, time: "09:00" }, [])).toEqual({
      daysBefore: 0,
      time: "09:00",
    });
  });
});

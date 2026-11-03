import { counterReachBlocker, NOT_A_PICKUP_REASON, otherDayReason } from "../counter-reach.js";

// Des jours comparés entre eux, jamais à l'horloge.
const TODAY = "2030-03-12";
const TOMORROW = "2030-03-13";

describe("counterReachBlocker — ce que le comptoir décide lui-même (2026-11-03)", () => {
  it("laisse décider un retrait du jour", () => {
    expect(
      counterReachBlocker({ fulfillmentMethod: "pickup", serviceDay: TODAY }, TODAY),
    ).toBeNull();
  });

  it("refuse une livraison, même du jour", () => {
    expect(counterReachBlocker({ fulfillmentMethod: "delivery", serviceDay: TODAY }, TODAY)).toBe(
      NOT_A_PICKUP_REASON,
    );
  });

  it("refuse un retrait d'un autre jour, en nommant ce jour", () => {
    const reason = counterReachBlocker(
      { fulfillmentMethod: "pickup", serviceDay: TOMORROW },
      TODAY,
    );

    expect(reason).toBe(otherDayReason(TOMORROW));
    expect(reason).toContain(TOMORROW);
  });

  it("refuse un retrait sans jour", () => {
    expect(counterReachBlocker({ fulfillmentMethod: "pickup", serviceDay: null }, TODAY)).toBe(
      otherDayReason(null),
    );
  });
});

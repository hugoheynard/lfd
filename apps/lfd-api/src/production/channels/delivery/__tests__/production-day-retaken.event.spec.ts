import {
  ProductionDayRetakenEvent,
  ProductionDayRetakenPayloadError,
} from "../production-day-retaken.event.js";

/** Un instant recopié, jamais comparé à l'horloge. */
const AT = new Date("2026-09-13T06:20:00.000Z");

describe("ProductionDayRetakenEvent", () => {
  it("se décrit en fait durable et se relit à l'identique, commandes absorbées comprises", () => {
    const fact = new ProductionDayRetakenEvent("2026-09-13", AT, 2, ["o1", "o2"]).durableFact();
    expect(fact.key).toBe(`production.day_retaken:2026-09-13:${AT.toISOString()}`);
    expect(fact.payload["orderIds"]).toEqual(["o1", "o2"]);
    expect(ProductionDayRetakenEvent.fromPayload(fact.payload)).toEqual(
      new ProductionDayRetakenEvent("2026-09-13", AT, 2, ["o1", "o2"]),
    );
  });

  /**
   * Un fait écrit avant CA6b n'a pas de liste : le refuser ferait de chaque
   * fait en attente un message mort.
   */
  it("tolère un ancien fait sans `orderIds`, relu avec une liste nulle", () => {
    const old = { serviceDay: "2026-09-13", retakenAt: AT.toISOString(), absorbed: 2 };

    expect(ProductionDayRetakenEvent.fromPayload(old)).toEqual(
      new ProductionDayRetakenEvent("2026-09-13", AT, 2, null),
    );
  });

  it.each([
    ["sans journée", { retakenAt: AT.toISOString(), absorbed: 1 }],
    ["instant illisible", { serviceDay: "2026-09-13", retakenAt: "hier", absorbed: 1 }],
    ["rien absorbé", { serviceDay: "2026-09-13", retakenAt: AT.toISOString(), absorbed: 0 }],
    [
      "liste illisible",
      { serviceDay: "2026-09-13", retakenAt: AT.toISOString(), absorbed: 1, orderIds: [3] },
    ],
  ])("refuse une charge %s", (_case, payload) => {
    expect(() => ProductionDayRetakenEvent.fromPayload(payload)).toThrow(
      ProductionDayRetakenPayloadError,
    );
  });
});

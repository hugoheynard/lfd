import {
  ProductionDayRetakenEvent,
  ProductionDayRetakenPayloadError,
} from "../production-day-retaken.event.js";

/** Un instant recopié, jamais comparé à l'horloge. */
const AT = new Date("2026-09-13T06:20:00.000Z");

describe("ProductionDayRetakenEvent", () => {
  it("se décrit en fait durable et se relit à l'identique", () => {
    const fact = new ProductionDayRetakenEvent("2026-09-13", AT, 2).durableFact();
    expect(fact.key).toBe(`production.day_retaken:2026-09-13:${AT.toISOString()}`);
    expect(ProductionDayRetakenEvent.fromPayload(fact.payload)).toEqual(
      new ProductionDayRetakenEvent("2026-09-13", AT, 2),
    );
  });

  it.each([
    ["sans journée", { retakenAt: AT.toISOString(), absorbed: 1 }],
    ["instant illisible", { serviceDay: "2026-09-13", retakenAt: "hier", absorbed: 1 }],
    ["rien absorbé", { serviceDay: "2026-09-13", retakenAt: AT.toISOString(), absorbed: 0 }],
  ])("refuse une charge %s", (_case, payload) => {
    expect(() => ProductionDayRetakenEvent.fromPayload(payload)).toThrow(
      ProductionDayRetakenPayloadError,
    );
  });
});

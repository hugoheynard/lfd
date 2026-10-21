import {
  ProductionDayClosedEvent,
  ProductionDayClosedPayloadError,
} from "../production-day-closed.event.js";
import {
  ProductionDayReopenedEvent,
  ProductionDayReopenedPayloadError,
} from "../production-day-reopened.event.js";

/** Dates comparées entre elles seulement : le contrat du fait, pas l'horloge. */
const CLOSED_AT = new Date("2026-09-07T18:00:00.000Z");
const REOPENED_AT = new Date("2026-09-07T19:00:00.000Z");

describe("production.day_closed porte les réassorts figés (lot R3a)", () => {
  it("écrit `resupplyIds` et le relit", () => {
    const fact = new ProductionDayClosedEvent("2026-09-08", CLOSED_AT, ["ord_1"], null, [
      "rs_1",
    ]).durableFact();

    expect(fact.payload["resupplyIds"]).toEqual(["rs_1"]);
    expect(ProductionDayClosedEvent.fromPayload(fact.payload).resupplyIds).toEqual(["rs_1"]);
  });

  it("un fait écrit avant le champ se relit sans réassort", () => {
    const payload = {
      serviceDay: "2026-09-08",
      closedAt: CLOSED_AT.toISOString(),
      orderIds: ["ord_1"],
      reannouncedAt: null,
    };

    expect(ProductionDayClosedEvent.fromPayload(payload).resupplyIds).toEqual([]);
  });

  it("refuse des réassorts hors forme", () => {
    const payload = {
      serviceDay: "2026-09-08",
      closedAt: CLOSED_AT.toISOString(),
      orderIds: [],
      resupplyIds: [42],
    };

    expect(() => ProductionDayClosedEvent.fromPayload(payload)).toThrow(
      ProductionDayClosedPayloadError,
    );
  });
});

describe("production.day_reopened porte les réassorts dégelés (lot R3a)", () => {
  it("écrit `resupplyIds` et le relit ; absent, vide", () => {
    const fact = new ProductionDayReopenedEvent(
      "2026-09-08",
      REOPENED_AT,
      CLOSED_AT,
      [],
      ["rs_1"],
    ).durableFact();
    const { resupplyIds: _written, ...before } = fact.payload;

    expect(ProductionDayReopenedEvent.fromPayload(fact.payload).resupplyIds).toEqual(["rs_1"]);
    expect(ProductionDayReopenedEvent.fromPayload(before).resupplyIds).toEqual([]);
    expect(() =>
      ProductionDayReopenedEvent.fromPayload({ ...fact.payload, resupplyIds: "rs_1" }),
    ).toThrow(ProductionDayReopenedPayloadError);
  });
});

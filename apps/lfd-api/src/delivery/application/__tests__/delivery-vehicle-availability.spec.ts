import type { RoundRow } from "../../domain/ports/delivery-rounds.reader.js";
import { fleetOccupationOf, parisSecondsOfDay } from "../delivery-vehicle-availability.js";
import type { KeptRound } from "../delivery-proposal-support.js";
import type { LocatedStop } from "../delivery-routing-support.js";

function round(id: string, vehicleId: string, orderIds: readonly string[]): RoundRow {
  return {
    id,
    vehicleId,
    vehicleName: `Camionnette ${vehicleId}`,
    passage: 1,
    version: 1,
    vehicleRetiredAt: null,
    departedAt: null,
    driverStaffId: null,
    returnedAt: null,
    planned: null,
    stops: orderIds.map((orderId, position) => ({ stopId: `${id}_${orderId}`, orderId, position })),
  };
}

function located(orderId: string, situated: boolean): LocatedStop {
  return {
    orderId,
    reference: `CMD-${orderId}`,
    point: situated ? { lat: 45.6, lng: 6.8 } : null,
    unlocated: situated ? null : "not_geocoded",
    window: null,
    stopSeconds: null,
    zoneId: null,
  };
}

const STOPS = new Map([
  ["o1", located("o1", true)],
  ["o2", located("o2", false)],
  ["o3", located("o3", true)],
]);

describe("ce qui occupe la flotte (lot 7 ter, L7t-C2)", () => {
  it("seules les tournées chargées ou parties occupent leur camionnette", () => {
    const kept: readonly KeptRound[] = [
      { round: round("r1", "v1", ["o1"]), reason: "loaded" },
      { round: round("r3", "v3", ["o3"]), reason: "not_requested" },
    ];

    const occupation = fleetOccupationOf(kept, STOPS);

    expect(occupation.busy.map((busy) => busy.roundId)).toEqual(["r1"]);
    expect([...occupation.unknownReturn]).toEqual([]);
  });

  it("un arrêt non situé dans une tournée partie : retour inconnu, la camionnette est écartée", () => {
    const kept: readonly KeptRound[] = [
      { round: round("r1", "v1", ["o1"]), reason: "loaded" },
      { round: round("r2", "v2", ["o2", "o3"]), reason: "departed" },
    ];

    const occupation = fleetOccupationOf(kept, STOPS);

    expect([...occupation.unknownReturn]).toEqual(["v2"]);
    expect(occupation.busy.map((busy) => busy.vehicle.id)).toEqual(["v1"]);
  });
});

describe("l'heure de Paris d'un instant", () => {
  it("en hiver, UTC + 1", () => {
    expect(parisSecondsOfDay(new Date(Date.UTC(2030, 0, 15, 5, 30, 0)))).toBe(6.5 * 3600);
  });

  it("en été, UTC + 2", () => {
    expect(parisSecondsOfDay(new Date(Date.UTC(2030, 6, 15, 5, 30, 0)))).toBe(7.5 * 3600);
  });
});

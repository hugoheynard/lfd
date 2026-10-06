import type { LocatedStop } from "../delivery-routing-support.js";
import { compositionZonesOf } from "../proposal-zones.js";

function located(orderId: string, zoneId: string | null): LocatedStop {
  return {
    orderId,
    reference: `CMD-${orderId}`,
    point: { lat: 45.6, lng: 6.8 },
    unlocated: null,
    window: null,
    stopSeconds: null,
    zoneId,
  };
}

describe("compositionZonesOf (2026-10-06)", () => {
  it("ne retient que les véhicules restreints et les commandes dont la zone est connue", () => {
    const zones = compositionZonesOf(
      [
        { id: "v_partout", name: "Trafic", allowedZoneIds: [] },
        { id: "v_nord", name: "Kangoo", allowedZoneIds: ["z_nord"] },
      ],
      new Map([
        ["o_1", located("o_1", "z_nord")],
        ["o_2", located("o_2", null)],
      ]),
    );

    expect([...zones.vehicles.keys()]).toEqual(["v_nord"]);
    expect(zones.vehicles.get("v_nord")).toEqual(new Set(["z_nord"]));
    expect([...zones.stops.entries()]).toEqual([["o_1", "z_nord"]]);
  });
});

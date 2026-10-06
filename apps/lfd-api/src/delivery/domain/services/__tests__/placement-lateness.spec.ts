import type { CostFn } from "../../ports/distance-matrix.js";
import { RoutingSettings } from "../../value-objects/routing-settings.js";
import { placementLateOrders } from "../placement-lateness.js";
import { timeComposition } from "../time-composition.js";

/** Dix minutes entre deux points distincts, une heure vers ou depuis « loin ». */
const COST: CostFn = {
  meters: (from, to) => (from === to ? 0 : 10_000),
  seconds: (from, to) => {
    if (from === to) {
      return 0;
    }
    return from === "far" || to === "far" ? 3600 : 600;
  },
};

const KANGOO = { id: "v1", name: "Kangoo" };
const MINUTE = 60;
const settings = RoutingSettings.define({
  ...RoutingSettings.DEFAULTS,
  stopMinutes: 5,
  safetyMarginMinutes: 0,
});
const deadline = (minutes: number) => ({ start: null, end: minutes * MINUTE });

function lateOf(stops: Parameters<typeof timeComposition>[0]["rounds"][number]["stops"]) {
  const ctx = { depotId: "depot", cost: COST, settings };
  const tours = timeComposition({ ...ctx, rounds: [{ roundId: "r1", vehicle: KANGOO, stops }] });
  return placementLateOrders(ctx, tours);
}

describe("placementLateOrders — l'alerte rouge (CA5, §9)", () => {
  it("nomme la commande que sa PLACE met en retard, alors que seule elle tiendrait", () => {
    const late = lateOf([
      { id: "far", window: null },
      { id: "near", window: deadline(30) },
    ]);

    expect([...late]).toEqual(["near"]);
  });

  it("ne nomme pas une commande en retard même seule : aucune place ne la sauverait", () => {
    const late = lateOf([{ id: "far", window: deadline(30) }]);

    expect(late.size).toBe(0);
  });

  it("ne nomme rien quand chaque échéance tient", () => {
    const late = lateOf([
      { id: "near", window: deadline(30) },
      { id: "far", window: null },
    ]);

    expect(late.size).toBe(0);
  });

  it("vaut aussi pour un second passage que le premier fait partir trop tard", () => {
    const ctx = { depotId: "depot", cost: COST, settings };
    const tours = timeComposition({
      ...ctx,
      rounds: [
        { roundId: "r1", vehicle: KANGOO, stops: [{ id: "far", window: null }] },
        { roundId: "r2", vehicle: KANGOO, stops: [{ id: "near", window: deadline(30) }] },
      ],
    });

    expect([...placementLateOrders(ctx, tours)]).toEqual(["near"]);
  });
});

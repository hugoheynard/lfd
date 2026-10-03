import type { CostFn } from "../../ports/distance-matrix.js";
import { RoutingSettings } from "../../value-objects/routing-settings.js";
import { timeComposition } from "../time-composition.js";

/** Dix minutes et dix kilomètres entre deux points distincts, quels qu'ils soient. */
const TEN_MINUTES: CostFn = {
  meters: (from, to) => (from === to ? 0 : 10_000),
  seconds: (from, to) => (from === to ? 0 : 600),
};

const KANGOO = { id: "v1", name: "Kangoo" };
const TRAFIC = { id: "v2", name: "Trafic" };
const SIX = 6 * 3600;

function settings(overrides: Partial<Parameters<typeof RoutingSettings.define>[0]> = {}) {
  return RoutingSettings.define({ ...RoutingSettings.DEFAULTS, stopMinutes: 5, ...overrides });
}

describe("timeComposition — chronométrer une composition telle quelle (L10b-C2)", () => {
  it("garde l'ordre des arrêts et des tournées", () => {
    const tours = timeComposition({
      depotId: "depot",
      rounds: [
        {
          roundId: "r1",
          vehicle: KANGOO,
          stops: [
            { id: "b", window: null },
            { id: "a", window: null },
          ],
        },
        { roundId: null, vehicle: TRAFIC, stops: [{ id: "c", window: null }] },
      ],
      cost: TEN_MINUTES,
      settings: settings(),
    });

    expect(tours.map((tour) => tour.stops.map((stop) => stop.id))).toEqual([["b", "a"], ["c"]]);
    expect(tours.map((tour) => tour.roundId)).toEqual(["r1", null]);
  });

  it("rien ne presse : chaque véhicule part à l'heure réglée ; son passage suivant, à son retour", () => {
    const tours = timeComposition({
      depotId: "depot",
      rounds: [
        { roundId: null, vehicle: KANGOO, stops: [{ id: "a", window: null }] },
        { roundId: null, vehicle: TRAFIC, stops: [{ id: "b", window: null }] },
        { roundId: null, vehicle: KANGOO, stops: [{ id: "c", window: null }] },
      ],
      cost: TEN_MINUTES,
      settings: settings(),
    });

    // Aller 10 min, arrêt 5 min, retour 10 min : 25 min.
    expect(tours.map((tour) => tour.timed.departure)).toEqual([SIX, SIX, SIX + 25 * 60]);
    expect(tours.map((tour) => tour.rank)).toEqual([1, 1, 2]);
  });

  it("passages enchaînés : une échéance du second fait partir le premier plus tôt (CA2)", () => {
    const tours = timeComposition({
      depotId: "depot",
      rounds: [
        { roundId: null, vehicle: KANGOO, stops: [{ id: "a", window: null }] },
        { roundId: null, vehicle: KANGOO, stops: [{ id: "b", window: { start: null, end: SIX } }] },
      ],
      cost: TEN_MINUTES,
      settings: settings({ safetyMarginMinutes: 0 }),
    });

    // Le second part à 5 h 50 pour b avant 6 h ; le premier (25 min) à 5 h 25.
    expect(tours.map((tour) => tour.timed.departure)).toEqual([SIX - 35 * 60, SIX - 10 * 60]);
    expect(tours.flatMap((tour) => tour.timed.missed)).toEqual([false, false]);
  });

  it("signale une tournée trop longue, sans la couper", () => {
    const [tour] = timeComposition({
      depotId: "depot",
      rounds: [
        {
          roundId: null,
          vehicle: KANGOO,
          stops: ["a", "b", "c"].map((id) => ({ id, window: null })),
        },
      ],
      cost: TEN_MINUTES,
      settings: settings({ maxRoundMinutes: 30 }),
    });

    expect(tour?.stops).toHaveLength(3);
    expect(tour?.overDuration).toBe(true);
  });
});

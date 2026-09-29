import { RoutingSettings } from "../../value-objects/routing-settings.js";
import { type PlannableStop, type ProposalInput, proposeRounds } from "../propose-rounds.js";
import { durationOf } from "../route-timing.js";
import { lineCost } from "./line-cost.js";

const MINUTE = 60;
const settings = (maxRoundMinutes: number, stopMinutes = 0): RoutingSettings =>
  RoutingSettings.define({ ...RoutingSettings.DEFAULTS, maxRoundMinutes, stopMinutes });

const loose = (id: string): PlannableStop => ({ id, window: null, homeRoundId: null });
const home = (id: string, roundId: string): PlannableStop => ({
  id,
  window: null,
  homeRoundId: roundId,
});

function input(
  overrides: Partial<ProposalInput> & Pick<ProposalInput, "stops" | "cost">,
): ProposalInput {
  return {
    depotId: "depot",
    vehicles: [{ id: "v1", name: "Kangoo" }],
    recomposable: [],
    settings: settings(240),
    ...overrides,
  };
}

describe("proposer (L7-C3, L7-C5, L7-C15)", () => {
  const twoSides = lineCost({ depot: 0, e1: 3, e2: 4, e3: 5, w1: -3, w2: -4, w3: -5 });
  const sides = ["e1", "e2", "e3", "w1", "w2", "w3"].map(loose);

  it("répartit entre les véhicules, un côté chacun, départ et retour au labo", () => {
    const proposal = proposeRounds(
      input({
        cost: twoSides,
        stops: sides,
        vehicles: [
          { id: "v2", name: "Trafic" },
          { id: "v1", name: "Kangoo" },
        ],
      }),
    );

    const byVehicle = new Map(
      proposal.tours.map((tour) => [tour.vehicleId, tour.stops.map((stop) => stop.id).sort()]),
    );
    expect([...byVehicle.values()].sort()).toEqual([
      ["e1", "e2", "e3"],
      ["w1", "w2", "w3"],
    ]);
    expect(proposal.tours.every((tour) => tour.rank === 1 && tour.roundId === null)).toBe(true);
    expect(proposal.overflow).toEqual([]);
  });

  it("est déterministe : même état, même proposition (L7-C12)", () => {
    const first = proposeRounds(input({ cost: twoSides, stops: sides }));
    const again = proposeRounds(input({ cost: twoSides, stops: [...sides].reverse() }));

    expect(again).toEqual(first);
  });

  it("découpe au-delà de la durée maximale en un second passage du même véhicule (Q13)", () => {
    const cost = lineCost({ depot: 0, a: 10, b: 11, c: -10, d: -11 });

    const proposal = proposeRounds(
      input({ cost, stops: ["a", "b", "c", "d"].map(loose), settings: settings(30) }),
    );

    expect(proposal.tours.map((tour) => [tour.vehicleId, tour.rank])).toEqual([
      ["v1", 1],
      ["v1", 2],
    ]);
    const [first, second] = proposal.tours;
    expect(proposal.tours.every((tour) => durationOf(tour.timed) <= 30 * MINUTE)).toBe(true);
    expect(second?.timed.departure).toBeGreaterThanOrEqual(first?.timed.return ?? Infinity);
    expect(proposal.tours.flatMap((tour) => tour.stops.map((s) => s.id)).sort()).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("un seul passage permis : ce qui ne tient pas dans le premier déborde", () => {
    const cost = lineCost({ depot: 0, a: 10, b: 11, c: -10, d: -11 });

    const proposal = proposeRounds(
      input({
        cost,
        stops: ["a", "b", "c", "d"].map(loose),
        settings: settings(30),
        passageLimits: new Map([["v1", 1]]),
      }),
    );

    expect(proposal.tours).toHaveLength(1);
    expect(proposal.overflow).toHaveLength(2);
  });

  it("compte le temps d'arrêt dans la durée maximale", () => {
    const cost = lineCost({ depot: 0, a: 5, b: 6 });

    // 5 + 1 + 6 = 12 minutes de route ; avec 10 minutes par arrêt, 32 > 30.
    const proposal = proposeRounds(
      input({ cost, stops: ["a", "b"].map(loose), settings: settings(30, 10) }),
    );

    expect(proposal.tours).toHaveLength(2);
  });

  it("un arrêt dont l'aller-retour seul dépasse la durée maximale déborde, signalé", () => {
    const cost = lineCost({ depot: 0, near: 2, far: 20 });

    const proposal = proposeRounds(
      input({ cost, stops: ["near", "far"].map(loose), settings: settings(30) }),
    );

    expect(proposal.overflow).toEqual(["far"]);
    expect(proposal.tours.flatMap((tour) => tour.stops.map((s) => s.id))).toEqual(["near"]);
  });

  it("un arrêt trop loin qui AVAIT une tournée y reste, et la tournée est signalée trop longue", () => {
    const cost = lineCost({ depot: 0, near: 2, far: 20 });

    const proposal = proposeRounds(
      input({
        cost,
        stops: [loose("near"), home("far", "r_old")],
        recomposable: [{ roundId: "r_old", vehicleId: "v9", vehicleName: "Vieux", passage: 1 }],
        settings: settings(30),
      }),
    );

    expect(proposal.overflow).toEqual([]);
    const kept = proposal.tours.find((tour) => tour.roundId === "r_old");
    expect(kept?.stops.map((s) => s.id)).toEqual(["far"]);
    expect(kept?.overDuration).toBe(true);
  });

  it("reprend les tournées recomposables du véhicule dans l'ordre de leur passage", () => {
    const cost = lineCost({ depot: 0, a: 10, b: 11, c: -10, d: -11 });

    const proposal = proposeRounds(
      input({
        cost,
        stops: [home("a", "r2"), home("b", "r2"), loose("c"), loose("d")],
        recomposable: [
          { roundId: "r2", vehicleId: "v1", vehicleName: "Kangoo", passage: 2 },
          { roundId: "r1", vehicleId: "v1", vehicleName: "Kangoo", passage: 1 },
        ],
        settings: settings(30),
      }),
    );

    expect(proposal.tours.map((tour) => tour.roundId)).toEqual(["r1", "r2"]);
  });

  it("sans arrêt situé, rien à proposer", () => {
    expect(proposeRounds(input({ cost: lineCost({ depot: 0 }), stops: [] }))).toEqual({
      tours: [],
      overflow: [],
    });
  });
});

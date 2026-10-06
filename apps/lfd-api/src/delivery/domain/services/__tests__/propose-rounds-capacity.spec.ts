import { RoutingSettings } from "../../value-objects/routing-settings.js";
import { insertIntoRounds } from "../insert-into-rounds.js";
import type { ProposedTour } from "../proposal.js";
import { type PlannableStop, proposeRounds } from "../propose-rounds.js";
import { capacityOf, ONE_STACK, ROOMY } from "./capacity-fixtures.js";
import { lineCost } from "./line-cost.js";

const HOUR = 3600;
const settings = (multiplePassages: boolean): RoutingSettings =>
  RoutingSettings.define({ ...RoutingSettings.DEFAULTS, stopMinutes: 0, multiplePassages });
const loose = (id: string): PlannableStop => ({ id, window: null, homeRoundId: null });
const COST = lineCost({ depot: 0, a: 3, b: 4, c: 5, n: 6 });
const ids = (tour: ProposedTour | undefined): readonly string[] =>
  (tour?.stops ?? []).map((stop) => stop.id);

describe("la capacité dans « Proposer » (CA4)", () => {
  it("sans capacité, a et b partagent une tournée ; avec, b part dans l'autre véhicule", () => {
    const base = {
      depotId: "depot",
      stops: [loose("a"), loose("b")],
      vehicles: [
        { id: "v1", name: "Vélo 1" },
        { id: "v2", name: "Vélo 2" },
      ],
      recomposable: [],
      cost: COST,
      settings: settings(true),
    };

    const free = proposeRounds(base);
    const bound = proposeRounds({
      ...base,
      capacity: capacityOf({ v1: ONE_STACK, v2: ONE_STACK }, { a: 3, b: 3 }),
    });

    expect(free.tours).toHaveLength(1);
    // Un second passage coûte la durée maximale : l'autre véhicule est moins cher.
    expect(bound.tours.map((tour) => [tour.vehicleId, ids(tour)])).toEqual([
      ["v1", ["a"]],
      ["v2", ["b"]],
    ]);
    expect(bound.capacityRefused).toEqual([]);
  });

  it("un seul véhicule plein : un second passage plutôt qu'une caisse qui déborde", () => {
    const proposal = proposeRounds({
      depotId: "depot",
      stops: [loose("a"), loose("b")],
      vehicles: [{ id: "v1", name: "Vélo" }],
      recomposable: [],
      cost: COST,
      settings: settings(true),
      capacity: capacityOf({ v1: ONE_STACK }, { a: 3, b: 3 }),
    });

    expect(proposal.tours.map((tour) => ids(tour).length)).toEqual([1, 1]);
    expect(proposal.tours.map((tour) => tour.rank)).toEqual([1, 2]);
  });

  it("rien ne tient : à répartir, raison « capacité », jamais posé en surcharge", () => {
    const proposal = proposeRounds({
      depotId: "depot",
      stops: [loose("a"), loose("b")],
      vehicles: [{ id: "v1", name: "Vélo" }],
      recomposable: [],
      cost: COST,
      settings: settings(false),
      capacity: capacityOf({ v1: ONE_STACK }, { a: 3, b: 6 }),
    });

    expect(proposal.tours.map(ids)).toEqual([["a"]]);
    expect(proposal.capacityRefused).toEqual(["b"]);
    expect(proposal.overflow).toEqual([]);
  });

  it("la capacité ne passe pas avant l'échéance (CA-D1) : l'arrêt pressé garde sa place", () => {
    const urgent: PlannableStop = {
      id: "a",
      window: { start: null, end: 1 * HOUR },
      homeRoundId: null,
    };
    const proposal = proposeRounds({
      depotId: "depot",
      stops: [urgent, loose("b")],
      vehicles: [
        { id: "v1", name: "Vélo" },
        { id: "v2", name: "Trafic" },
      ],
      recomposable: [],
      cost: COST,
      settings: settings(true),
      capacity: capacityOf({ v1: ONE_STACK, v2: ROOMY }, { a: 3, b: 3 }),
    });

    const all = proposal.tours.flatMap((tour) => tour.timed.missed);
    expect(all.every((missed) => !missed)).toBe(true);
    expect(proposal.tours.flatMap(ids).sort()).toEqual(["a", "b"]);
  });

  it("Insérer : une tournée pleine refuse l'insertion, la commande prend un autre passage", () => {
    const proposal = insertIntoRounds({
      depotId: "depot",
      cost: COST,
      settings: settings(true),
      stops: [{ id: "n", window: null }],
      vehicles: [{ id: "v1", name: "Vélo" }],
      rounds: [
        {
          roundId: "r1",
          vehicleId: "v1",
          vehicleName: "Vélo",
          passage: 1,
          stops: [
            { id: "c", window: null },
            { id: "a", window: null },
          ],
        },
      ],
      capacity: capacityOf({ v1: ONE_STACK }, { a: 2, c: 2, n: 2 }),
    });

    expect(proposal.tours.map((tour) => [tour.roundId, ids(tour)])).toEqual([[null, ["n"]]]);
    expect(proposal.capacityRefused).toEqual([]);
  });

  it("Insérer sans passage permis : la commande reste à répartir, raison « capacité »", () => {
    const proposal = insertIntoRounds({
      depotId: "depot",
      cost: COST,
      settings: settings(false),
      stops: [{ id: "n", window: null }],
      vehicles: [{ id: "v1", name: "Vélo" }],
      rounds: [
        {
          roundId: "r1",
          vehicleId: "v1",
          vehicleName: "Vélo",
          passage: 1,
          stops: [{ id: "a", window: null }],
        },
      ],
      passageLimits: new Map([["v1", 0]]),
      capacity: capacityOf({ v1: ONE_STACK }, { a: 4, n: 2 }),
    });

    expect(proposal.tours).toEqual([]);
    expect(proposal.capacityRefused).toEqual(["n"]);
    expect(proposal.overflow).toEqual([]);
  });
});

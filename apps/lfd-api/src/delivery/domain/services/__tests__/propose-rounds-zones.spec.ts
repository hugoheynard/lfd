import { RoutingSettings } from "../../value-objects/routing-settings.js";
import { insertIntoRounds, type InsertionInput } from "../insert-into-rounds.js";
import { proposeRounds, type ProposalInput } from "../propose-rounds.js";
import type { RoutingStop } from "../route-timing.js";
import type { CompositionZones } from "../zone-rule.js";
import { lineCost } from "./line-cost.js";
import { outOfZoneStops } from "./zone-check.js";

const stop = (id: string): RoutingStop => ({ id, window: null });
const settings = RoutingSettings.define({ ...RoutingSettings.DEFAULTS, stopMinutes: 0 });
/** Le nord à gauche du fournil, le sud à droite. */
const cost = lineCost({ depot: 0, n1: -5, n2: -8, s1: 5, s2: 9 });
const VEHICLES = [
  { id: "v_nord", name: "Kangoo nord" },
  { id: "v_sud", name: "Kangoo sud" },
];

function zones(vehicles: Readonly<Record<string, readonly string[]>>): CompositionZones {
  return {
    vehicles: new Map(Object.entries(vehicles).map(([id, list]) => [id, new Set(list)])),
    stops: new Map([
      ["n1", "nord"],
      ["n2", "nord"],
      ["s1", "sud"],
      ["s2", "sud"],
    ]),
  };
}

function complete(overrides: Partial<ProposalInput> = {}): ProposalInput {
  return {
    depotId: "depot",
    stops: ["n1", "n2", "s1", "s2"].map((id) => ({ ...stop(id), homeRoundId: null })),
    vehicles: VEHICLES,
    recomposable: [],
    cost,
    settings,
    ...overrides,
  };
}

function idsOf(proposal: ReturnType<typeof proposeRounds>, vehicleId: string): readonly string[] {
  return proposal.tours
    .filter((tour) => tour.vehicleId === vehicleId)
    .flatMap((tour) => tour.stops.map((s) => s.id))
    .sort();
}

describe("les zones autorisées d'un véhicule (2026-10-06)", () => {
  it("« Proposer » ne pose jamais un arrêt dans un véhicule non autorisé sur sa zone", () => {
    // Un seul véhicule suffirait au coût : la règle force le partage.
    const restricted = zones({ v_nord: ["nord"], v_sud: ["sud"] });
    const proposal = proposeRounds(complete({ zones: restricted }));

    expect(idsOf(proposal, "v_nord")).toEqual(["n1", "n2"]);
    expect(idsOf(proposal, "v_sud")).toEqual(["s1", "s2"]);
    expect(outOfZoneStops(proposal, restricted)).toEqual([]);
    expect(proposal.zoneRefused).toEqual([]);
  });

  it("aucun véhicule autorisé : à répartir, raison zone — jamais posé ailleurs", () => {
    const proposal = proposeRounds(
      complete({ zones: zones({ v_nord: ["nord"], v_sud: ["nord"] }) }),
    );

    expect(proposal.zoneRefused).toEqual(["s1", "s2"]);
    expect(proposal.overflow).toEqual([]);
    expect(proposal.capacityRefused).toEqual([]);
    expect(proposal.tours.flatMap((tour) => tour.stops.map((s) => s.id))).not.toContain("s1");
  });

  it("une commande sans zone connue va partout", () => {
    const proposal = proposeRounds(
      complete({
        stops: [{ ...stop("s1"), homeRoundId: null }],
        vehicles: [VEHICLES[0] ?? { id: "", name: "" }],
        zones: { vehicles: new Map([["v_nord", new Set(["nord"])]]), stops: new Map() },
      }),
    );

    expect(idsOf(proposal, "v_nord")).toEqual(["s1"]);
  });

  it("sans véhicule restreint, la proposition est celle d'avant la règle", () => {
    const without = proposeRounds(complete());
    const unrestricted = proposeRounds(complete({ zones: zones({}) }));

    expect(unrestricted).toEqual(without);
  });

  it("« Insérer » : jamais dans un véhicule non autorisé, et l'arrêt posé à la main hors zone reste", () => {
    const restricted = zones({ v_nord: ["nord"] });
    const input: InsertionInput = {
      depotId: "depot",
      cost,
      settings,
      vehicles: VEHICLES,
      // s2 a été glissé à la main dans le Kangoo nord : il n'est pas défait.
      rounds: [
        {
          roundId: "r1",
          vehicleId: "v_nord",
          vehicleName: "Kangoo nord",
          passage: 1,
          stops: [stop("n1"), stop("s2")],
        },
      ],
      stops: [stop("s1"), stop("n2")],
      zones: restricted,
    };
    const proposal = insertIntoRounds(input);

    expect(idsOf(proposal, "v_nord")).toEqual(["n1", "n2", "s2"]);
    expect(idsOf(proposal, "v_sud")).toEqual(["s1"]);
    expect(proposal.zoneRefused).toEqual([]);
  });

  it("« Insérer » : aucun véhicule autorisé, raison zone", () => {
    const proposal = insertIntoRounds({
      depotId: "depot",
      cost,
      settings,
      vehicles: [VEHICLES[0] ?? { id: "", name: "" }],
      rounds: [],
      stops: [stop("s1")],
      zones: zones({ v_nord: ["nord"] }),
    });

    expect(proposal.zoneRefused).toEqual(["s1"]);
    expect(proposal.overflow).toEqual([]);
  });
});

import { RoutingSettings } from "../../value-objects/routing-settings.js";
import { type InsertionInput, insertIntoRounds } from "../insert-into-rounds.js";
import type { RoutingStop } from "../route-timing.js";
import { lineCost } from "./line-cost.js";

const stop = (id: string): RoutingStop => ({ id, window: null });
const settings = (maxRoundMinutes: number): RoutingSettings =>
  RoutingSettings.define({ ...RoutingSettings.DEFAULTS, maxRoundMinutes, stopMinutes: 0 });
const ids = (stops: readonly RoutingStop[]): readonly string[] => stops.map((s) => s.id);

/** Une tournée du Kangoo placée À LA MAIN dans un ordre que l'optimiseur n'aurait pas choisi. */
function input(overrides: Partial<InsertionInput> = {}): InsertionInput {
  return {
    depotId: "depot",
    cost: lineCost({ depot: 0, a: -5, b: -7, c: -10, far: 25 }),
    settings: settings(240),
    stops: [stop("b")],
    vehicles: [{ id: "v1", name: "Kangoo" }],
    rounds: [
      {
        roundId: "r1",
        vehicleId: "v1",
        vehicleName: "Kangoo",
        passage: 1,
        stops: [stop("c"), stop("a")],
      },
    ],
    ...overrides,
  };
}

describe("insérer dans les tournées existantes (mode insert)", () => {
  it("insère au moindre surcoût SANS réordonner les arrêts placés à la main", () => {
    const proposal = insertIntoRounds(input());

    const [tour] = proposal.tours;
    expect(tour?.roundId).toBe("r1");
    const order = ids(tour?.stops ?? []);
    // L'optimiseur aurait mis a (-5) avant c (-10) ; l'ordre de la main reste.
    expect(order.filter((id) => id !== "b")).toEqual(["c", "a"]);
    expect(order).toContain("b");
    expect(proposal.overflow).toEqual([]);
  });

  /**
   * Réécrit le 2026-10-03 (CA2, Q2) : la durée maximale renvoyait « far » à
   * une tournée neuve. Elle ne refuse plus une place : la tournée existante le
   * prend, et elle est signalée longue.
   */
  it("la durée maximale ne refuse plus une place : la tournée la prend, signalée longue", () => {
    const proposal = insertIntoRounds(input({ stops: [stop("far")], settings: settings(60) }));

    expect(proposal.tours.map((tour) => tour.roundId)).toEqual(["r1"]);
    expect(ids(proposal.tours[0]?.stops ?? [])).toContain("far");
    expect(proposal.tours[0]?.overDuration).toBe(true);
    expect(proposal.overflow).toEqual([]);
  });

  it("pas de passage quand le réglage l'interdit : ça déborde, signalé", () => {
    const proposal = insertIntoRounds(
      input({
        stops: [stop("far")],
        rounds: [],
        passageLimits: new Map([["v1", 0]]),
      }),
    );

    expect(proposal.tours).toEqual([]);
    expect(proposal.overflow).toEqual(["far"]);
  });

  it("une tournée qui ne reçoit rien n'est pas proposée", () => {
    const proposal = insertIntoRounds(input({ stops: [] }));

    expect(proposal).toEqual({ tours: [], overflow: [], capacityRefused: [] });
  });

  it("un véhicule sans tournée en reçoit une neuve", () => {
    const proposal = insertIntoRounds(input({ rounds: [] }));

    expect(proposal.tours.map((tour) => [tour.roundId, tour.rank, ids(tour.stops)])).toEqual([
      [null, 1, ["b"]],
    ]);
  });

  it("insère dans la tournée d'un AUTRE véhicule quand elle coûte moins (L7b-C1)", () => {
    // Le Kangoo tourne à l'ouest ; le Trafic, à l'est, passe déjà à côté de « east ».
    const proposal = insertIntoRounds(
      input({
        cost: lineCost({ depot: 0, a: -5, b: -7, c: -10, east: 12, e1: 10, e2: 14 }),
        stops: [stop("east")],
        vehicles: [
          { id: "v1", name: "Kangoo" },
          { id: "v2", name: "Trafic" },
        ],
        rounds: [
          {
            roundId: "r1",
            vehicleId: "v1",
            vehicleName: "Kangoo",
            passage: 1,
            stops: [stop("c"), stop("a")],
          },
          {
            roundId: "r2",
            vehicleId: "v2",
            vehicleName: "Trafic",
            passage: 1,
            stops: [stop("e2"), stop("e1")],
          },
        ],
      }),
    );

    expect(proposal.tours.map((tour) => tour.roundId)).toEqual(["r2"]);
    const order = ids(proposal.tours[0]?.stops ?? []);
    expect(order).toContain("east");
    expect(order.filter((id) => id !== "east")).toEqual(["e2", "e1"]);
  });

  it("l'amélioration ne déplace ni ne réordonne jamais un arrêt placé à la main (L7b-C3)", () => {
    // « e1 » est à la main dans la tournée de l'ouest, où il coûte cher : un
    // calcul libre le rendrait à l'est. Épinglé, il reste, dans son ordre.
    const proposal = insertIntoRounds(
      input({
        cost: lineCost({ depot: 0, a: -5, c: -10, e1: 10, e2: 14, east: 12 }),
        stops: [stop("east")],
        vehicles: [
          { id: "v1", name: "Kangoo" },
          { id: "v2", name: "Trafic" },
        ],
        rounds: [
          {
            roundId: "r1",
            vehicleId: "v1",
            vehicleName: "Kangoo",
            passage: 1,
            stops: [stop("c"), stop("e1"), stop("a")],
          },
          {
            roundId: "r2",
            vehicleId: "v2",
            vehicleName: "Trafic",
            passage: 1,
            stops: [stop("e2")],
          },
        ],
      }),
    );

    const r1 = proposal.tours.find((tour) => tour.roundId === "r1");
    const r2 = proposal.tours.find((tour) => tour.roundId === "r2");
    expect(r1).toBeUndefined();
    expect(ids(r2?.stops ?? []).filter((id) => id !== "east")).toEqual(["e2"]);
  });

  it("est déterministe", () => {
    const many = input({ stops: [stop("b"), stop("far")], settings: settings(240) });

    expect(insertIntoRounds(many)).toEqual(
      insertIntoRounds({ ...many, stops: [...many.stops].reverse() }),
    );
  });
});

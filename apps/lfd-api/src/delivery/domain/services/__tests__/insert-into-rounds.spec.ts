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

  it("ne dépasse pas la durée maximale : ce qui ne tient pas va à une tournée neuve", () => {
    const proposal = insertIntoRounds(input({ stops: [stop("far")], settings: settings(60) }));

    expect(proposal.tours.map((tour) => [tour.roundId, ids(tour.stops)])).toEqual([
      [null, ["far"]],
    ]);
    expect(proposal.tours[0]?.rank).toBe(2);
  });

  it("pas de second passage quand le réglage l'interdit : ça déborde, signalé", () => {
    const proposal = insertIntoRounds(
      input({
        stops: [stop("far")],
        settings: settings(60),
        passageLimits: new Map([["v1", 0]]),
      }),
    );

    expect(proposal.tours).toEqual([]);
    expect(proposal.overflow).toEqual(["far"]);
  });

  it("une tournée qui ne reçoit rien n'est pas proposée", () => {
    const proposal = insertIntoRounds(input({ stops: [] }));

    expect(proposal).toEqual({ tours: [], overflow: [] });
  });

  it("un véhicule sans tournée en reçoit une neuve", () => {
    const proposal = insertIntoRounds(input({ rounds: [] }));

    expect(proposal.tours.map((tour) => [tour.roundId, tour.rank, ids(tour.stops)])).toEqual([
      [null, 1, ["b"]],
    ]);
  });

  it("est déterministe", () => {
    const many = input({ stops: [stop("b"), stop("far")], settings: settings(240) });

    expect(insertIntoRounds(many)).toEqual(
      insertIntoRounds({ ...many, stops: [...many.stops].reverse() }),
    );
  });
});

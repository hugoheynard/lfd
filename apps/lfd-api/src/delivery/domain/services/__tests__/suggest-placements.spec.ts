import { RoutingSettings } from "../../value-objects/routing-settings.js";
import type { RoutingStop } from "../route-timing.js";
import { type SuggestionInput, suggestPlacements } from "../suggest-placements.js";
import { capacityOf, ONE_STACK } from "./capacity-fixtures.js";
import { lineCost } from "./line-cost.js";

const MINUTE = 60;
const stop = (id: string): RoutingStop => ({ id, window: null });
const settings = RoutingSettings.define({ ...RoutingSettings.DEFAULTS, stopMinutes: 0 });

/**
 * Une tournée du Kangoo à la main : a (3 min), puis c (5 min) ; le fournil à
 * 0. Revenir vers le fournil coûte une minute de plus : sans ce sens, une
 * ligne rendrait plusieurs places au même prix.
 */
function input(overrides: Partial<SuggestionInput> = {}): SuggestionInput {
  return {
    depotId: "depot",
    cost: lineCost({ depot: 0, a: 3, b: 4, c: 5, d: 7, w: -4, x: -3 }, 1),
    settings,
    stops: [stop("d")],
    vehicles: [{ id: "v1", name: "Kangoo" }],
    rounds: [
      {
        roundId: "r1",
        vehicleId: "v1",
        vehicleName: "Kangoo",
        passage: 1,
        stops: [stop("a"), stop("c")],
      },
    ],
    ...overrides,
  };
}

describe("la place suggérée d'une commande arrivée sur un jour appliqué (CA7)", () => {
  it("suggère l'insertion la moins chère, dit après combien d'arrêts et le temps ajouté", () => {
    // 0 → 3 → 5 → 0 = 11 min ; avec d au bout : 0 → 3 → 5 → 7 → 0 = 15 min.
    expect(suggestPlacements(input())).toEqual([
      { kind: "placed", orderId: "d", roundId: "r1", position: 2, extraSeconds: 4 * MINUTE },
    ]);
  });

  it("insère ENTRE deux arrêts quand c'est là qu'elle coûte le moins, sans rien réordonner", () => {
    const [suggestion] = suggestPlacements(input({ stops: [stop("b")] }));

    expect(suggestion).toEqual({
      kind: "placed",
      orderId: "b",
      roundId: "r1",
      position: 1,
      extraSeconds: 0,
    });
  });

  it("juge chaque commande seule, contre la composition enregistrée", () => {
    const suggestions = suggestPlacements(input({ stops: [stop("d"), stop("b")] }));

    expect(suggestions.map((s) => (s.kind === "placed" ? [s.orderId, s.position] : null))).toEqual([
      ["b", 1],
      ["d", 2],
    ]);
  });

  it("n'ouvre jamais de tournée : sans tournée, aucune place, raison « no_round »", () => {
    expect(suggestPlacements(input({ rounds: [] }))).toEqual([
      { kind: "none", orderId: "d", reason: "no_round" },
    ]);
  });

  it("une place qui ferait manquer une échéance n'est pas suggérée, raison « deadline »", () => {
    // Fermée à 2 min, d est à 7 min du fournil : en retard partout.
    const late = { id: "d", window: { start: null, end: 2 * MINUTE } };

    expect(suggestPlacements(input({ stops: [late] }))).toEqual([
      { kind: "none", orderId: "d", reason: "deadline" },
    ]);
  });

  it("une caisse qui déborderait n'est pas une place, raison « capacity »", () => {
    const capacity = capacityOf({ v1: ONE_STACK }, { a: 2, c: 2, d: 3 });

    expect(suggestPlacements(input({ capacity }))).toEqual([
      { kind: "none", orderId: "d", reason: "capacity" },
    ]);
  });

  it("aucun véhicule autorisé sur sa zone : raison « zone »", () => {
    const zones = {
      vehicles: new Map([["v1", new Set(["nord"])]]),
      stops: new Map([["d", "sud"]]),
    };

    expect(suggestPlacements(input({ zones }))).toEqual([
      { kind: "none", orderId: "d", reason: "zone" },
    ]);
  });

  it("va dans la tournée d'un autre véhicule quand elle coûte moins", () => {
    // En tête de r1 : +9 min ; devant x, à une minute : +2 min.
    const suggestions = suggestPlacements(
      input({
        stops: [stop("w")],
        vehicles: [
          { id: "v1", name: "Kangoo" },
          { id: "v2", name: "Trafic" },
        ],
        rounds: [
          ...input().rounds,
          { roundId: "r2", vehicleId: "v2", vehicleName: "Trafic", passage: 1, stops: [stop("x")] },
        ],
      }),
    );

    expect(suggestions).toEqual([
      { kind: "placed", orderId: "w", roundId: "r2", position: 0, extraSeconds: 2 * MINUTE },
    ]);
  });
});

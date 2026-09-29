import { partitionStops } from "../fleet-planner.js";
import { lineCost, planeCost } from "./line-cost.js";

describe("répartir : k-medoids sur les coûts (L7-C3)", () => {
  /**
   * Deux vallées dans le MÊME axe depuis le labo : l'une à 5 minutes, l'autre
   * au fond, à 40. Un balayage angulaire les verrait confondues — même angle —
   * et couperait n'importe où ; les coûts les séparent.
   */
  it("sépare deux vallées que l'angle confondrait", () => {
    const cost = planeCost({
      depot: [0, 0],
      near1: [5, 0.2],
      near2: [5.5, -0.1],
      near3: [6, 0],
      far1: [40, 0.1],
      far2: [41, -0.2],
      far3: [42, 0],
    });

    const clusters = partitionStops(
      "depot",
      ["far2", "near1", "far1", "near3", "far3", "near2"],
      2,
      cost,
    );

    expect(clusters.map((members) => [...members].sort())).toEqual(
      expect.arrayContaining([
        ["near1", "near2", "near3"],
        ["far1", "far2", "far3"],
      ]),
    );
  });

  it("est déterministe : même entrée dans un autre ordre, même répartition", () => {
    const cost = planeCost({
      depot: [0, 0],
      a: [1, 1],
      b: [2, 1],
      c: [-3, 2],
      d: [-4, 2],
      e: [0, -5],
      f: [1, -6],
    });
    const ids = ["a", "b", "c", "d", "e", "f"];

    const first = partitionStops("depot", ids, 3, cost);
    const second = partitionStops("depot", [...ids].reverse(), 3, cost);

    expect(second).toEqual(first);
  });

  it("départage les égalités par l'identifiant", () => {
    // Deux arrêts au MÊME point : ils vont ensemble, jamais au hasard.
    const cost = lineCost({ depot: 0, b: 10, a: 10, c: -10 });

    expect(partitionStops("depot", ["b", "a", "c"], 2, cost)).toEqual([["a", "b"], ["c"]]);
  });

  it("moins d'arrêts que de véhicules : un groupe par arrêt", () => {
    const cost = lineCost({ depot: 0, a: 1, b: 2 });

    expect(partitionStops("depot", ["b", "a"], 5, cost)).toEqual([["a"], ["b"]]);
  });

  it("rien à répartir : aucun groupe", () => {
    expect(partitionStops("depot", [], 3, lineCost({ depot: 0 }))).toEqual([]);
  });
});

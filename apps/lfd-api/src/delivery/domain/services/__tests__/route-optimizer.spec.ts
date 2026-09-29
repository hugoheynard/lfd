import { nearestNeighbour, optimizeRoute } from "../route-optimizer.js";
import { type RouteClock, type RoutingStop, routeScore, timeRoute } from "../route-timing.js";
import { lineCost } from "./line-cost.js";

const CLOCK: RouteClock = { earliestDeparture: 6 * 3600, stopSeconds: 0 };

const stop = (id: string, window: RoutingStop["window"] = null): RoutingStop => ({ id, window });
const ids = (sequence: readonly RoutingStop[]): readonly string[] => sequence.map((s) => s.id);

describe("ordonner une tournée : ATSP (L7-C3)", () => {
  /**
   * Sur une ligne, le plus proche voisin part à +1, revient à -2, repart à +4 :
   * 1 + 3 + 6 + 4 = 14 minutes. En allant d'abord au bout d'un côté, 12.
   */
  const cost = lineCost({ depot: 0, plus1: 1, minus2: -2, plus4: 4 });
  const stops = [stop("plus1"), stop("minus2"), stop("plus4")];

  it("le plus proche voisin seul se trompe", () => {
    const greedy = nearestNeighbour("depot", stops, cost);

    expect(ids(greedy)).toEqual(["plus1", "minus2", "plus4"]);
    expect(routeScore(timeRoute("depot", greedy, cost, CLOCK))).toBe(14 * 60);
  });

  it("Or-opt et 2-opt améliorent le plus proche voisin", () => {
    const optimized = optimizeRoute("depot", stops, cost, CLOCK);

    expect(routeScore(timeRoute("depot", optimized, cost, CLOCK))).toBe(12 * 60);
  });

  it("tient compte du sens : une matrice asymétrique change l'ordre", () => {
    // Redescendre vers les petites abscisses coûte 10 minutes de plus : on
    // monte d'abord jusqu'au bout, pour ne redescendre qu'une fois.
    const oneWay = lineCost({ depot: 0, plus1: 1, minus2: -2, plus4: 4 }, 10);

    const optimized = optimizeRoute("depot", stops, oneWay, CLOCK);

    expect(ids(optimized)).toEqual(["plus1", "plus4", "minus2"]);
  });

  it("est déterministe : même entrée dans un autre ordre, même ordre rendu", () => {
    const shuffled = [stops[2], stops[0], stops[1]].flatMap((s) => (s === undefined ? [] : [s]));

    expect(ids(optimizeRoute("depot", shuffled, cost, CLOCK))).toEqual(
      ids(optimizeRoute("depot", stops, cost, CLOCK)),
    );
  });

  it("fait passer devant l'arrêt dont la fenêtre finit tôt (L7-C4)", () => {
    // Sans fenêtre, on irait d'abord au plus près (-1). La fenêtre de +4 se
    // ferme 5 minutes après le départ : il passe en premier.
    const windows = [
      stop("minus1"),
      stop("plus4", { start: null, end: CLOCK.earliestDeparture + 5 * 60 }),
    ];
    const near = lineCost({ depot: 0, minus1: -1, plus4: 4 });
    expect(ids(nearestNeighbour("depot", windows, near))).toEqual(["minus1", "plus4"]);

    const optimized = optimizeRoute("depot", windows, near, CLOCK);

    expect(ids(optimized)).toEqual(["plus4", "minus1"]);
    expect(timeRoute("depot", optimized, near, CLOCK).missed).toEqual([false, false]);
  });

  it("une tournée vide reste vide", () => {
    expect(optimizeRoute("depot", [], cost, CLOCK)).toEqual([]);
  });
});

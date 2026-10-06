import { RoutingSettings } from "../../value-objects/routing-settings.js";
import { bestCase, costFloorOf } from "../cost-floor.js";
import { freeStart, isBetterScore, type Routes, scoreVehicle } from "../vehicle-plan.js";
import { benchDay } from "./composition-bench-day.js";
import { lineCost } from "./line-cost.js";

const HOUR = 3600;
const MINUTE = 60;
const ctx = {
  depotId: "depot",
  cost: lineCost({ depot: 0, a: 10, b: 30, c: -20 }),
  settings: RoutingSettings.define({
    ...RoutingSettings.DEFAULTS,
    maxRoundMinutes: 60,
    safetyMarginMinutes: 15,
  }),
};
const FREE = freeStart(ctx);

/** Une attente devant une porte, une arrivée dans la marge, un temps propre à l'adresse. */
const ROUTES: Routes = [
  {
    roundId: null,
    stops: [
      { id: "a", window: { start: 9 * HOUR, end: 10 * HOUR } },
      { id: "b", window: { start: null, end: 6 * HOUR + 40 * MINUTE }, stopSeconds: 20 * MINUTE },
    ],
  },
  { roundId: null, stops: [] },
  { roundId: null, stops: [{ id: "c", window: null }] },
];

describe("le minorant du coût d'un véhicule (composition-automatique.md §5)", () => {
  it("vaut le score exact quand rien n'attend ni n'entre dans la marge", () => {
    const plain: Routes = [{ roundId: null, stops: [{ id: "c", window: null }] }];

    expect(costFloorOf(ctx)(plain, FREE)).toBe(scoreVehicle(ctx, plain, FREE).cost);
  });

  it("reste sous le score : l'attente et la marge ne font qu'ajouter", () => {
    const floor = costFloorOf(ctx)(ROUTES, FREE);

    expect(floor).toBeLessThan(scoreVehicle(ctx, ROUTES, FREE).cost);
  });

  it("compte le second passage d'un véhicule occupé comme le score", () => {
    const plain: Routes = [{ roundId: null, stops: [{ id: "c", window: null }] }];
    const busy = { availableFrom: 8 * HOUR, passagesBefore: 1 };

    expect(costFloorOf(ctx)(plain, busy)).toBe(scoreVehicle(ctx, plain, busy).cost);
  });

  it("une tournée vide ne coûte rien, pas même son ouverture", () => {
    expect(costFloorOf(ctx)([{ roundId: "r1", stops: [] }], FREE)).toBe(0);
  });

  /**
   * La propriété dont dépend l'amélioration : un geste écarté par le
   * minorant n'aurait JAMAIS été retenu. Éprouvée sur les tournées d'une
   * vraie journée du banc, découpées de toutes les façons.
   */
  it("n'écarte jamais un score qui aurait amélioré", () => {
    const day = benchDay(3, 40).complete;
    const floor = costFloorOf(day);
    const stops = day.stops;
    for (let cut = 0; cut <= stops.length; cut += 5) {
      const routes: Routes = [
        { roundId: null, stops: stops.slice(0, cut) },
        { roundId: null, stops: stops.slice(cut) },
      ];
      const start = freeStart(day);
      const exact = scoreVehicle(day, routes, start);
      expect(floor(routes, start)).toBeLessThanOrEqual(exact.cost);
      // `bestCase` est au moins aussi bon que le score réel : il ne le rate pas.
      expect(isBetterScore(exact, bestCase(floor(routes, start)))).toBe(false);
    }
  });
});

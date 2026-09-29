import { RoutingSettings } from "../../value-objects/routing-settings.js";
import {
  LATE_WEIGHT,
  openingOf,
  ROUND_OPENING_SECONDS,
  type Routes,
  scoreVehicle,
  timeVehicle,
} from "../vehicle-plan.js";
import { lineCost } from "./line-cost.js";

const HOUR = 3600;
const MINUTE = 60;
const ctx = {
  depotId: "depot",
  cost: lineCost({ depot: 0, a: 10, b: 30, c: -20 }),
  settings: RoutingSettings.define({ ...RoutingSettings.DEFAULTS, maxRoundMinutes: 60 }),
};

/** Deux passages : un retard, une attente, un temps de livraison propre à l'adresse. */
const ROUTES: Routes = [
  {
    roundId: null,
    stops: [
      { id: "a", window: { start: 6 * HOUR + 30 * MINUTE, end: 7 * HOUR } },
      { id: "b", window: { start: null, end: 6 * HOUR + 40 * MINUTE }, stopSeconds: 20 * MINUTE },
    ],
  },
  { roundId: null, stops: [{ id: "c", window: null }] },
];

describe("le coût d'un véhicule (L7b-C2)", () => {
  it("rechronomètre exactement comme timeRoute, passage après passage", () => {
    const timed = timeVehicle(ctx, ROUTES, openingOf(ctx));
    const secondPassage = ctx.settings.maxRoundMinutes * MINUTE;
    const expected = timed.reduce(
      (total, route) =>
        total +
        (route.return - route.departure) +
        LATE_WEIGHT * route.lateSeconds +
        ROUND_OPENING_SECONDS,
      secondPassage,
    );

    expect(timed[0]?.lateSeconds).toBeGreaterThan(0);
    expect(scoreVehicle(ctx, ROUTES).cost).toBe(expected);
  });

  it("rend à part ce qui dépasse la durée maximale", () => {
    const [first] = timeVehicle(ctx, ROUTES, openingOf(ctx));
    const over = (first?.return ?? 0) - (first?.departure ?? 0) - 60 * MINUTE;

    expect(over).toBeGreaterThan(0);
    expect(scoreVehicle(ctx, ROUTES).overSeconds).toBe(over);
  });

  it("une tournée existante vidée ne coûte rien", () => {
    expect(scoreVehicle(ctx, [{ roundId: "r1", stops: [] }])).toEqual({ cost: 0, overSeconds: 0 });
  });
});

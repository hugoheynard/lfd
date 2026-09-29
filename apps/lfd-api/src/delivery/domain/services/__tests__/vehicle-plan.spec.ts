import { RoutingSettings } from "../../value-objects/routing-settings.js";
import {
  freeStart,
  isBetterScore,
  MARGIN_WEIGHT,
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
  settings: RoutingSettings.define({
    ...RoutingSettings.DEFAULTS,
    maxRoundMinutes: 60,
    safetyMarginMinutes: 0,
  }),
};
const FREE = freeStart(ctx);

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
      (total, route) => total + (route.return - route.departure) + ROUND_OPENING_SECONDS,
      secondPassage,
    );
    const late = timed.reduce((total, route) => total + route.lateSeconds, 0);

    expect(late).toBeGreaterThan(0);
    expect(scoreVehicle(ctx, ROUTES, FREE)).toMatchObject({ lateSeconds: late, cost: expected });
  });

  it("rend à part ce qui dépasse la durée maximale", () => {
    const [first] = timeVehicle(ctx, ROUTES, openingOf(ctx));
    const over = (first?.return ?? 0) - (first?.departure ?? 0) - 60 * MINUTE;

    expect(over).toBeGreaterThan(0);
    expect(scoreVehicle(ctx, ROUTES, FREE).overSeconds).toBe(over);
  });

  it("une tournée existante vidée ne coûte rien", () => {
    expect(scoreVehicle(ctx, [{ roundId: "r1", stops: [] }], FREE)).toEqual({
      lateSeconds: 0,
      cost: 0,
      overSeconds: 0,
    });
  });
});

describe("l'ordre des priorités (lot 7 ter, L7t-C1)", () => {
  it("aucun prix ne rachète un retard : sans retard l'emporte toujours", () => {
    const withoutLate = { lateSeconds: 0, cost: 1e12 };
    const withLate = { lateSeconds: 1, cost: 0 };

    expect(isBetterScore(withoutLate, withLate)).toBe(true);
    expect(isBetterScore(withLate, withoutLate)).toBe(false);
  });

  it("à retard égal, le moins cher l'emporte ; à égalité, aucun des deux", () => {
    expect(isBetterScore({ lateSeconds: 5, cost: 1 }, { lateSeconds: 5, cost: 2 })).toBe(true);
    expect(isBetterScore({ lateSeconds: 5, cost: 2 }, { lateSeconds: 5, cost: 2 })).toBe(false);
  });

  it("arriver dans la marge coûte MARGIN_WEIGHT par seconde, proportionnellement", () => {
    const margin = {
      ...ctx,
      settings: RoutingSettings.define({ ...ctx.settings.values(), safetyMarginMinutes: 20 }),
    };
    // Dépôt → a : 10 min ; départ 6 h 00, arrivée 6 h 10. Créneau jusqu'à 6 h 20 :
    // dix minutes dans la marge de vingt.
    const route = (end: number): Routes => [
      { roundId: null, stops: [{ id: "a", window: { start: null, end } }] },
    ];
    const tight = scoreVehicle(margin, route(6 * HOUR + 20 * MINUTE), freeStart(margin));
    const easy = scoreVehicle(margin, route(9 * HOUR), freeStart(margin));

    expect(tight.lateSeconds).toBe(0);
    expect(tight.cost - easy.cost).toBe(MARGIN_WEIGHT * 10 * MINUTE);
  });

  it("une marge de zéro ne coûte rien", () => {
    const route: Routes = [
      { roundId: null, stops: [{ id: "a", window: { start: null, end: 6 * HOUR + 10 * MINUTE } }] },
    ];
    const far: Routes = [{ roundId: null, stops: [{ id: "a", window: null }] }];

    expect(scoreVehicle(ctx, route, FREE).cost).toBe(scoreVehicle(ctx, far, FREE).cost);
  });
});

describe("un véhicule occupé (lot 7 ter, L7t-C2)", () => {
  it("ne part qu'à son retour, et sa première tournée est un second passage", () => {
    const route: Routes = [{ roundId: null, stops: [{ id: "c", window: null }] }];
    const busy = { availableFrom: 8 * HOUR, passagesBefore: 1 };
    const [timed] = timeVehicle(ctx, route, busy.availableFrom);

    expect(timed?.departure).toBe(8 * HOUR);
    expect(scoreVehicle(ctx, route, busy).cost - scoreVehicle(ctx, route, FREE).cost).toBe(
      ctx.settings.maxRoundMinutes * MINUTE,
    );
  });
});

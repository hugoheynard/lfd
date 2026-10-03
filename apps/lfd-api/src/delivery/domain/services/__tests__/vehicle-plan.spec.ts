import { RoutingSettings } from "../../value-objects/routing-settings.js";
import {
  freeStart,
  isBetterScore,
  MARGIN_WEIGHT,
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
    const timed = timeVehicle(ctx, ROUTES, FREE.availableFrom);
    const secondPassage = ctx.settings.maxRoundMinutes * MINUTE;
    const expected = timed.reduce(
      (total, route) => total + (route.return - route.departure) + ROUND_OPENING_SECONDS,
      secondPassage,
    );
    const late = timed.reduce((total, route) => total + route.lateSeconds, 0);

    expect(late).toBeGreaterThan(0);
    expect(scoreVehicle(ctx, ROUTES, FREE)).toMatchObject({ lateSeconds: late, cost: expected });
  });

  /**
   * Réécrit le 2026-10-03 (CA2, Q2 — Hugo) : le score rendait à part le
   * dépassement de la durée maximale, et l'insertion comme l'amélioration
   * refusaient tout geste qui l'augmentait. La durée maximale cède devant la
   * règle 1 : elle n'est plus qu'un signal (`overDuration`).
   */
  it("la durée maximale n'entre plus dans le score : elle ne refuse rien", () => {
    const [first] = timeVehicle(ctx, ROUTES, FREE.availableFrom);

    expect((first?.return ?? 0) - (first?.departure ?? 0)).toBeGreaterThan(60 * MINUTE);
    expect(Object.keys(scoreVehicle(ctx, ROUTES, FREE)).sort()).toEqual(["cost", "lateSeconds"]);
  });

  it("une tournée existante vidée ne coûte rien", () => {
    expect(scoreVehicle(ctx, [{ roundId: "r1", stops: [] }], FREE)).toEqual({
      lateSeconds: 0,
      cost: 0,
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
    // Un véhicule libre seulement à 6 h (CA2 : sinon il partirait assez tôt
    // pour éviter la marge). Dépôt → a : 10 min ; arrivée 6 h 10. Créneau
    // jusqu'à 6 h 20 : dix minutes dans la marge de vingt.
    const sixAm = { availableFrom: 6 * HOUR, passagesBefore: 0 };
    const route = (end: number): Routes => [
      { roundId: null, stops: [{ id: "a", window: { start: null, end } }] },
    ];
    const tight = scoreVehicle(margin, route(6 * HOUR + 20 * MINUTE), sixAm);
    const easy = scoreVehicle(margin, route(9 * HOUR), sixAm);

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

describe("le départ à rebours (CA2, CA-D1 — tout le monde est servi avant son échéance)", () => {
  const backward = {
    depotId: "depot",
    cost: lineCost({ depot: 0, far: 120, p: 60, q: -60, a: 10, b: 20 }),
    settings: RoutingSettings.define({
      ...RoutingSettings.DEFAULTS,
      earliestDeparture: "06:00",
      stopMinutes: 5,
      safetyMarginMinutes: 0,
    }),
  };
  const deadline = (id: string, end: number): Routes[number]["stops"][number] => ({
    id,
    window: { start: null, end },
  });

  it("échéance à 6 h, deux heures de route : part à 4 h, aucun retard", () => {
    const routes: Routes = [{ roundId: null, stops: [deadline("far", 6 * HOUR)] }];

    const [timed] = timeVehicle(backward, routes, freeStart(backward).availableFrom);

    expect(timed?.departure).toBe(4 * HOUR);
    expect(timed?.missed).toEqual([false]);
    expect(scoreVehicle(backward, routes, freeStart(backward)).lateSeconds).toBe(0);
  });

  it("deux passages enchaînés : le premier part assez tôt pour que le second tienne", () => {
    // Le second doit partir à 5 h (q à une heure, avant 6 h) ; le premier,
    // p à une heure + 5 min sur place + une heure de retour, part à 2 h 55.
    const routes: Routes = [
      { roundId: null, stops: [deadline("p", 9 * HOUR)] },
      { roundId: null, stops: [deadline("q", 6 * HOUR)] },
    ];

    const [first, second] = timeVehicle(backward, routes, freeStart(backward).availableFrom);

    expect(first?.departure).toBe(2 * HOUR + 55 * MINUTE);
    expect(second?.departure).toBe(5 * HOUR);
    expect(second?.departure).toBeGreaterThanOrEqual(first?.return ?? Infinity);
    expect([...(first?.missed ?? []), ...(second?.missed ?? [])]).toEqual([false, false]);
    expect(scoreVehicle(backward, routes, freeStart(backward)).lateSeconds).toBe(0);
  });

  it("une échéance intenable même en partant à minuit : le retard est signalé", () => {
    const routes: Routes = [{ roundId: null, stops: [deadline("far", 1 * HOUR)] }];

    const [timed] = timeVehicle(backward, routes, freeStart(backward).availableFrom);

    expect(timed?.departure).toBe(0);
    expect(timed?.missed).toEqual([true]);
    expect(timed?.lateSeconds).toBe(1 * HOUR);
    expect(scoreVehicle(backward, routes, freeStart(backward)).lateSeconds).toBe(1 * HOUR);
  });

  it("une fenêtre qui a un début garde son début : on attend à la porte", () => {
    // a ferme à 6 h et presse le départ ; b n'ouvre qu'à 8 h : on l'attend.
    const routes: Routes = [
      {
        roundId: null,
        stops: [deadline("a", 6 * HOUR), { id: "b", window: { start: 8 * HOUR, end: 9 * HOUR } }],
      },
    ];

    const [timed] = timeVehicle(backward, routes, freeStart(backward).availableFrom);

    expect(timed?.departure).toBe(5 * HOUR + 50 * MINUTE);
    expect(timed?.arrivals).toEqual([6 * HOUR, 6 * HOUR + 15 * MINUTE]);
    expect(timed?.missed).toEqual([false, false]);
    // Livré à 8 h, 5 min sur place, 20 min de retour.
    expect(timed?.return).toBe(8 * HOUR + 25 * MINUTE);
  });

  it("rien ne presse : la tournée part à l'heure réglée, pas à minuit", () => {
    const routes: Routes = [{ roundId: null, stops: [{ id: "a", window: null }] }];

    const [timed] = timeVehicle(backward, routes, freeStart(backward).availableFrom);

    expect(timed?.departure).toBe(6 * HOUR);
  });
});

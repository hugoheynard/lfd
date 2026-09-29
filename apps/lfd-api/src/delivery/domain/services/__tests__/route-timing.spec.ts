import { durationOf, type RouteClock, timeRoute } from "../route-timing.js";
import { lineCost } from "./line-cost.js";

const SIX = 6 * 3600;
const MINUTE = 60;
const cost = lineCost({ depot: 0, a: 10, b: 20 });

describe("chronométrer une tournée (L7-C15)", () => {
  it("part à l'heure au plus tôt, compte le temps d'arrêt, revient au départ", () => {
    const clock: RouteClock = { earliestDeparture: SIX, stopSeconds: 5 * MINUTE };

    const route = timeRoute(
      "depot",
      [
        { id: "a", window: null },
        { id: "b", window: null },
      ],
      cost,
      clock,
    );

    expect(route.departure).toBe(SIX);
    expect(route.arrivals).toEqual([SIX + 10 * MINUTE, SIX + 25 * MINUTE]);
    // 10 + 5 + 10 + 5 + 20 de retour.
    expect(durationOf(route)).toBe(50 * MINUTE);
    expect(route.meters).toBe(40_000);
  });

  it("part PLUS TARD si la première fenêtre le permet, jamais plus tôt que l'heure au plus tôt", () => {
    const clock: RouteClock = { earliestDeparture: SIX, stopSeconds: 0 };
    const eight = 8 * 3600;

    const late = timeRoute(
      "depot",
      [{ id: "a", window: { start: eight, end: eight + 3600 } }],
      cost,
      clock,
    );
    const early = timeRoute(
      "depot",
      [{ id: "a", window: { start: SIX, end: SIX + 3600 } }],
      cost,
      clock,
    );

    expect(late.departure).toBe(eight - 10 * MINUTE);
    expect(late.arrivals).toEqual([eight]);
    expect(early.departure).toBe(SIX);
  });

  it("attend l'ouverture d'une fenêtre, et signale une arrivée après sa fin", () => {
    const clock: RouteClock = { earliestDeparture: SIX, stopSeconds: 0 };

    const route = timeRoute(
      "depot",
      [
        { id: "a", window: null },
        { id: "b", window: { start: null, end: SIX + 15 * MINUTE } },
      ],
      cost,
      clock,
    );

    expect(route.missed).toEqual([false, true]);
    expect(route.lateSeconds).toBe(5 * MINUTE);
  });

  it("une tournée sans arrêt ne dure rien", () => {
    const route = timeRoute("depot", [], cost, { earliestDeparture: SIX, stopSeconds: 300 });

    expect(durationOf(route)).toBe(0);
    expect(route.meters).toBe(0);
  });
});

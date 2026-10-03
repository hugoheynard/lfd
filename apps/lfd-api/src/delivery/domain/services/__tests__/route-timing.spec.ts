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

  it("prend le temps de livraison de l'arrêt quand son adresse en donne un (L7b-C4)", () => {
    const clock: RouteClock = { earliestDeparture: SIX, stopSeconds: 5 * MINUTE };

    const route = timeRoute(
      "depot",
      [
        { id: "a", window: null, stopSeconds: 20 * MINUTE },
        { id: "b", window: null },
      ],
      cost,
      clock,
    );

    // 10 + 20 sur place (l'adresse) + 10 + 5 (le réglage) + 20 de retour.
    expect(route.arrivals).toEqual([SIX + 10 * MINUTE, SIX + 40 * MINUTE]);
    expect(durationOf(route)).toBe(65 * MINUTE);
  });

  /**
   * Réécrit le 2026-10-03 (CA2, CA-D1) : le départ s'alignait sur le DÉBUT de
   * la première fenêtre, au-dessus de l'heure au plus tôt. Il se calcule
   * désormais à rebours, sur la FIN de chaque fenêtre (moins la marge visée).
   */
  it("part au plus tard qui tient la fin de la fenêtre, marge comprise, jamais sous le plancher", () => {
    const clock: RouteClock = { earliestDeparture: SIX, stopSeconds: 0 };
    const eight = 8 * 3600;
    const window = { start: eight, end: eight + 3600 };

    const late = timeRoute("depot", [{ id: "a", window }], cost, clock);
    const margin = timeRoute("depot", [{ id: "a", window }], cost, {
      ...clock,
      safetySeconds: 20 * MINUTE,
    });
    const floored = timeRoute(
      "depot",
      [{ id: "a", window: { start: null, end: SIX + 5 * MINUTE } }],
      cost,
      clock,
    );

    expect(late.departure).toBe(eight + 50 * MINUTE);
    expect(late.arrivals).toEqual([eight + 60 * MINUTE]);
    expect(late.missed).toEqual([false]);
    expect(margin.departure).toBe(eight + 30 * MINUTE);
    expect(floored.departure).toBe(SIX);
    expect(floored.lateSeconds).toBe(5 * MINUTE);
  });

  it("rien ne presse : part à l'heure réglée, ou plus tard pour ne pas attendre (CA2)", () => {
    const clock: RouteClock = { earliestDeparture: 0, stopSeconds: 0, idleDeparture: SIX };

    const loose = timeRoute("depot", [{ id: "a", window: null }], cost, clock);

    expect(loose.departure).toBe(SIX);
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

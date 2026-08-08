import { computeOrderMetrics, type OrderDayTally } from "../order-metrics.js";

const NOW = new Date("2026-08-20T10:00:00.000Z");

function tally(over: Partial<OrderDayTally> = {}): OrderDayTally {
  return { caCents: 0, orders: 0, caRecurringCents: 0, caOneShotCents: 0, ...over };
}

describe("computeOrderMetrics", () => {
  it("projette les agrégats sur la fenêtre et remplit 0 pour les jours vides", () => {
    const byDay = new Map<string, OrderDayTally>([
      [
        "2026-08-18",
        tally({ caCents: 3000, orders: 2, caRecurringCents: 1000, caOneShotCents: 2000 }),
      ],
    ]);
    const view = computeOrderMetrics(["2026-08-18", "2026-08-19"], byDay, NOW);

    expect(view.days).toEqual(["2026-08-18", "2026-08-19"]);
    expect(view.caCents).toEqual([3000, 0]);
    expect(view.orders).toEqual([2, 0]);
    expect(view.caRecurringCents).toEqual([1000, 0]);
    expect(view.caOneShotCents).toEqual([2000, 0]);
    expect(view.computedAt).toBe(NOW.toISOString());
  });

  it("récurrent + unique reconstituent le CA total", () => {
    const byDay = new Map<string, OrderDayTally>([
      [
        "2026-08-18",
        tally({ caCents: 5000, orders: 3, caRecurringCents: 3200, caOneShotCents: 1800 }),
      ],
    ]);
    const [rec] = computeOrderMetrics(["2026-08-18"], byDay, NOW).caRecurringCents;
    const [one] = computeOrderMetrics(["2026-08-18"], byDay, NOW).caOneShotCents;
    const [total] = computeOrderMetrics(["2026-08-18"], byDay, NOW).caCents;
    expect((rec ?? 0) + (one ?? 0)).toBe(total);
  });
});

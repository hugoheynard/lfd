import {
  accountConcentration,
  acquisitionMix,
  lifecycleFlow,
  velocityMetrics,
} from "../growth-stats-advanced.js";
import { weekStarts } from "../growth-stats.js";
import type { GrowthStatsEvent } from "../growth-stats.js";

function ev(
  type: string,
  subjectType: string,
  subjectId: string,
  at: string,
  payload: Record<string, unknown> = {},
): GrowthStatsEvent {
  return { type, subjectType, subjectId, occurredAt: new Date(at), actorType: "customer", payload };
}

describe("lifecycleFlow", () => {
  it("relie inscrit → commandé/sans commande → déclaré → activé via ownerUserId", () => {
    const flow = lifecycleFlow([
      ev("user.registered", "user", "u1", "2026-08-01T00:00:00Z"),
      ev("user.registered", "user", "u2", "2026-08-01T00:00:00Z"),
      ev("order.placed", "user", "u1", "2026-08-03T00:00:00Z", { totalCents: 100 }),
      ev("company.declared", "company", "c1", "2026-08-05T00:00:00Z", { ownerUserId: "u1" }),
      ev("company.activated", "company", "c1", "2026-08-08T00:00:00Z"),
    ]);
    const link = (s: string, t: string): number =>
      flow.links.find((l) => l.source === s && l.target === t)?.value ?? 0;
    expect(link("registered", "ordered")).toBe(1);
    expect(link("registered", "noOrder")).toBe(1);
    expect(link("ordered", "declared")).toBe(1);
    expect(link("declared", "activated")).toBe(1);
  });
});

describe("velocityMetrics", () => {
  it("mesure le délai → 1re commande (jours) par personne", () => {
    const [firstOrder] = velocityMetrics([
      ev("user.registered", "user", "u1", "2026-08-01T00:00:00Z"),
      ev("order.placed", "user", "u1", "2026-08-05T00:00:00Z", { totalCents: 100 }),
    ]);
    expect(firstOrder.key).toBe("first_order");
    expect(firstOrder.count).toBe(1);
    expect(firstOrder.quantiles.median).toBe(4);
  });
});

describe("accountConcentration", () => {
  it("calcule Lorenz + Gini + part du top décile par acheteur", () => {
    // 10 comptes : 9 à 100, 1 à 9100 → forte concentration.
    const events: GrowthStatsEvent[] = [];
    for (let i = 0; i < 9; i += 1) {
      events.push(ev("order.placed", "user", `u${i}`, "2026-08-01T00:00:00Z", { totalCents: 100 }));
    }
    events.push(ev("order.placed", "user", "u_big", "2026-08-01T00:00:00Z", { totalCents: 9100 }));
    const c = accountConcentration(events);
    expect(c.accounts).toBe(10);
    expect(c.totalVolumeCents).toBe(10_000);
    expect(c.topDecileShare).toBeCloseTo(0.91, 2);
    expect(c.gini).toBeGreaterThan(0.5);
  });

  it("rend une concentration nulle sans commande", () => {
    const c = accountConcentration([]);
    expect(c).toMatchObject({ accounts: 0, gini: 0, topDecileShare: 0 });
  });
});

describe("acquisitionMix", () => {
  it("product-led = self pur ; sales-led = staff + tout lead converti (D4)", () => {
    const now = new Date("2026-08-20T00:00:00Z");
    const window = weekStarts(now, 4);
    const mix = acquisitionMix(
      [
        ev("company.declared", "company", "c1", "2026-08-17T00:00:00Z", { via: "self" }),
        ev("company.declared", "company", "c2", "2026-08-17T00:00:00Z", { via: "staff" }),
        // Un lead converti est sales-led même quand la conversion s'est faite à
        // l'inscription (`via=registration`) : la personne avait été démarchée.
        ev("lead.converted", "lead", "l1", "2026-08-17T00:00:00Z", { via: "registration" }),
        ev("lead.converted", "lead", "l2", "2026-08-17T00:00:00Z", { via: "manual" }),
      ],
      window,
    );
    const week = mix.find((p) => p.weekStart === "2026-08-17");
    expect(week).toMatchObject({ productLed: 1, salesLed: 3 });
  });
});

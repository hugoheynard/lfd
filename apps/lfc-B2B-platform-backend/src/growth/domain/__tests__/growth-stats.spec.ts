import type { LeadView } from "@lfd/contracts";

import { deriveGrowthStats, type GrowthStatsEvent } from "../growth-stats.js";

const NOW = new Date("2026-08-20T10:00:00.000Z");

function ev(
  type: string,
  subjectType: string,
  subjectId: string,
  at: string,
  payload: Record<string, unknown> = {},
): GrowthStatsEvent {
  return { type, subjectType, subjectId, occurredAt: new Date(at), actorType: "customer", payload };
}

function lead(overrides: Partial<LeadView> = {}): LeadView {
  return {
    id: "lead_1",
    businessName: "Bistrot",
    contactName: "",
    email: "",
    phone: "",
    siret: "",
    status: "qualified",
    notes: "",
    linkedUserId: null,
    createdAt: "2026-08-10T09:00:00.000Z",
    lastContactedAt: null,
    ...overrides,
  };
}

describe("deriveGrowthStats", () => {
  it("calcule les KPIs (hot/mid/cold, commandes, conversion)", () => {
    const stats = deriveGrowthStats(
      [
        ev("user.registered", "user", "u_hot", "2026-08-10T09:00:00.000Z", { email: "h@r.fr" }),
        ev("order.placed", "user", "u_hot", "2026-08-15T09:00:00.000Z", { totalCents: 5000 }),
        ev("user.registered", "user", "u_mid", "2026-08-12T09:00:00.000Z", { email: "m@r.fr" }),
        ev("company.declared", "company", "c1", "2026-08-05T09:00:00.000Z", { via: "self" }),
        ev("company.activated", "company", "c1", "2026-08-10T09:00:00.000Z"),
        ev("company.declared", "company", "c2", "2026-08-06T09:00:00.000Z", { via: "self" }),
      ],
      [lead({ id: "l1", status: "contacted" })],
      NOW,
    );
    expect(stats.kpis).toMatchObject({
      hot: 1,
      mid: 1,
      cold: 1,
      orders: 1,
      ordersTotalCents: 5000,
      companiesDeclared: 2,
      companiesActivated: 1,
      conversionRate: 0.5,
    });
  });

  it("bucketise l'acquisition par semaine (inscriptions + 1res commandes)", () => {
    const stats = deriveGrowthStats(
      [
        ev("user.registered", "user", "u1", "2026-08-17T09:00:00.000Z"),
        ev("order.placed", "user", "u1", "2026-08-18T09:00:00.000Z", { totalCents: 100 }),
        ev("order.placed", "user", "u1", "2026-08-19T09:00:00.000Z", { totalCents: 100 }),
      ],
      [],
      NOW,
      4,
    );
    // Semaine du 17 août (lundi) : 1 inscription + 1 première commande (pas 2).
    const week = stats.acquisition.find((p) => p.weekStart === "2026-08-17");
    expect(week).toMatchObject({ registrations: 1, firstOrders: 1 });
    expect(stats.weeks).toBe(4);
    expect(stats.acquisition).toHaveLength(4);
  });

  it("construit l'entonnoir d'activation décroissant (fuites = frictions)", () => {
    const stats = deriveGrowthStats(
      [
        ev("company.declared", "company", "c1", "2026-08-05T09:00:00.000Z", { via: "self" }),
        ev("company.step_reached", "company", "c1", "2026-08-06T09:00:00.000Z", { step: "tva" }),
        ev("company.step_reached", "company", "c1", "2026-08-07T09:00:00.000Z", { step: "kbis" }),
        ev("company.declared", "company", "c2", "2026-08-05T09:00:00.000Z", { via: "self" }),
        ev("company.step_reached", "company", "c2", "2026-08-06T09:00:00.000Z", { step: "tva" }),
      ],
      [],
      NOW,
    );
    const counts = stats.activationFunnel.map((s) => `${s.key}:${s.count}`);
    expect(counts).toEqual([
      "declared:2",
      "tva:2",
      "kbis:1",
      "billing:0",
      "delivery:0",
      "activated:0",
    ]);
  });

  it("construit l'entonnoir cold en progression pipeline", () => {
    const stats = deriveGrowthStats(
      [],
      [
        lead({ id: "l1", status: "new" }),
        lead({ id: "l2", status: "qualified" }),
        lead({ id: "l3", status: "converted" }),
      ],
      NOW,
    );
    const counts = stats.coldFunnel.map((s) => s.count);
    // captured=3, contacted+=2 (qualified,converted), qualified+=2, negotiating+=1, converted=1
    expect(counts).toEqual([3, 2, 2, 1, 1]);
  });

  it("calcule des cohortes de rétention par semaine d'inscription", () => {
    const stats = deriveGrowthStats(
      [
        ev("user.registered", "user", "u1", "2026-08-10T09:00:00.000Z"),
        ev("order.placed", "user", "u1", "2026-08-11T09:00:00.000Z", { totalCents: 100 }),
        ev("order.placed", "user", "u1", "2026-08-18T09:00:00.000Z", { totalCents: 100 }),
      ],
      [],
      NOW,
      4,
    );
    const cohort = stats.cohorts.find((c) => c.cohortWeek === "2026-08-10");
    expect(cohort?.size).toBe(1);
    // Semaine 0 (inscription) et semaine +1 : commande présente → rétention 1.
    expect(cohort?.retention[0]).toBe(1);
    expect(cohort?.retention[1]).toBe(1);
  });
});

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
  /**
   * Régression (lot P3, 2026-10-25) : les KPIs comptaient les particuliers —
   * `hot`/`mid` en prospects, leurs commandes sans société dans « Commandes ».
   */
  it("calcule les KPIs sans particuliers : leads ouverts, commandes de société, conversion", () => {
    const stats = deriveGrowthStats(
      [
        ev("user.registered", "user", "u_perso", "2026-08-10T09:00:00.000Z"),
        ev("order.placed", "user", "u_perso", "2026-08-15T09:00:00.000Z", { totalCents: 900 }),
        ev("order.placed", "user", "u_pro", "2026-08-15T09:00:00.000Z", {
          totalCents: 5000,
          companyId: "c1",
        }),
        ev("company.declared", "company", "c1", "2026-08-05T09:00:00.000Z", { via: "self" }),
        ev("company.activated", "company", "c1", "2026-08-10T09:00:00.000Z"),
        ev("company.declared", "company", "c2", "2026-08-06T09:00:00.000Z", { via: "self" }),
      ],
      [lead({ id: "l1", status: "contacted" }), lead({ id: "l2", status: "lost" })],
      NOW,
    );
    expect(stats.kpis).toEqual({
      prospects: 1,
      orders: 1,
      ordersTotalCents: 5000,
      companiesDeclared: 2,
      companiesActivated: 1,
      conversionRate: 0.5,
    });
  });

  it("bucketise l'acquisition par semaine : sociétés déclarées, 1res commandes de société, leads", () => {
    const stats = deriveGrowthStats(
      [
        ev("company.declared", "company", "c1", "2026-08-17T09:00:00.000Z", { via: "self" }),
        ev("order.placed", "user", "u1", "2026-08-18T09:00:00.000Z", {
          totalCents: 100,
          companyId: "c1",
        }),
        ev("order.placed", "user", "u1", "2026-08-19T09:00:00.000Z", {
          totalCents: 100,
          companyId: "c1",
        }),
        // Un particulier : ni inscription ni commande ne comptent.
        ev("user.registered", "user", "u_perso", "2026-08-17T09:00:00.000Z"),
        ev("order.placed", "user", "u_perso", "2026-08-18T09:00:00.000Z", { totalCents: 100 }),
        ev("lead.captured", "lead", "l1", "2026-08-18T09:00:00.000Z"),
      ],
      [],
      NOW,
      4,
    );
    // Semaine du 17 août (lundi) : 1 déclaration + 1 première commande (pas 2) + 1 lead.
    const week = stats.acquisition.find((p) => p.weekStart === "2026-08-17");
    expect(week).toEqual({
      weekStart: "2026-08-17",
      companiesDeclared: 1,
      firstOrders: 1,
      leadsCaptured: 1,
    });
    expect(stats.weeks).toBe(4);
    expect(stats.acquisition).toHaveLength(4);
  });

  it("construit l'entonnoir d'activation décroissant (fuites = frictions)", () => {
    const stats = deriveGrowthStats(
      [
        ev("company.declared", "company", "c1", "2026-08-05T09:00:00.000Z", { via: "self" }),
        ev("company.step_reached", "company", "c1", "2026-08-06T09:00:00.000Z", { step: "vat" }),
        ev("company.step_reached", "company", "c1", "2026-08-07T09:00:00.000Z", { step: "kbis" }),
        ev("company.declared", "company", "c2", "2026-08-05T09:00:00.000Z", { via: "self" }),
        ev("company.step_reached", "company", "c2", "2026-08-06T09:00:00.000Z", { step: "vat" }),
      ],
      [],
      NOW,
    );
    const counts = stats.activationFunnel.map((s) => `${s.key}:${s.count}`);
    expect(counts).toEqual([
      "declared:2",
      "vat:2",
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

  it("compte un lead PERDU dans les étapes qu'il avait franchies (via le journal)", () => {
    // Le statut courant `lost` ne dit rien du chemin parcouru : sans le journal, ce
    // lead disparaissait des marches « Contactés » et « Qualifiés ».
    const stats = deriveGrowthStats(
      [
        ev("lead.stage_changed", "lead", "l1", "2026-08-10T09:00:00.000Z", {
          status: "contacted",
        }),
        ev("lead.stage_changed", "lead", "l1", "2026-08-12T09:00:00.000Z", {
          status: "qualified",
        }),
        ev("lead.lost", "lead", "l1", "2026-08-14T09:00:00.000Z"),
      ],
      [lead({ id: "l1", status: "lost" })],
      NOW,
    );

    // captured=1, contacted=1, qualified=1, negotiating=0, converted=0
    expect(stats.coldFunnel.map((s) => s.count)).toEqual([1, 1, 1, 0, 0]);
  });

  it("calcule des cohortes de rétention par semaine de déclaration de société", () => {
    const stats = deriveGrowthStats(
      [
        ev("company.declared", "company", "c1", "2026-08-10T09:00:00.000Z", { via: "self" }),
        ev("order.placed", "user", "u1", "2026-08-11T09:00:00.000Z", {
          totalCents: 100,
          companyId: "c1",
        }),
        ev("order.placed", "user", "u1", "2026-08-18T09:00:00.000Z", {
          totalCents: 100,
          companyId: "c1",
        }),
        ev("company.declared", "company", "c2", "2026-08-12T09:00:00.000Z", { via: "staff" }),
      ],
      [],
      NOW,
      4,
    );
    const cohort = stats.cohorts.find((c) => c.cohortWeek === "2026-08-10");
    expect(cohort?.size).toBe(2);
    // c1 commande en semaine 0 et +1 ; c2 jamais → 1/2 chaque fois.
    expect(cohort?.retention[0]).toBe(0.5);
    expect(cohort?.retention[1]).toBe(0.5);
  });

  /** Régression (lot P3, 2026-10-25) : la cohorte était celle des personnes inscrites. */
  it("ne forme aucune cohorte de particuliers inscrits", () => {
    const stats = deriveGrowthStats(
      [
        ev("user.registered", "user", "u1", "2026-08-10T09:00:00.000Z"),
        ev("order.placed", "user", "u1", "2026-08-11T09:00:00.000Z", { totalCents: 100 }),
      ],
      [],
      NOW,
      4,
    );
    expect(stats.cohorts).toEqual([]);
  });
});

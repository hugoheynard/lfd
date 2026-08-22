/**
 * E2E du dashboard de croissance (`GET /admin/growth/stats`) — vrai Postgres.
 * Prouve que l'agrégat lit le journal + les leads, calcule les KPIs/entonnoirs, et
 * que la route est murée staff.
 */
import type { GrowthStatsView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import type { InputJsonObject } from "../src/platform/database/client/internal/prismaNamespace.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

let ctx: E2eContext;
let sequence = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  sequence = 0;
});

function staff(): ReturnType<E2eContext["http"]> {
  return ctx.http().set("Authorization", "Bearer staff-e2e");
}

async function seed(
  type: string,
  subjectType: string,
  subjectId: string,
  occurredAt: string,
  payload: InputJsonObject = {},
): Promise<void> {
  sequence += 1;
  await ctx.prisma.activityEvent.create({
    data: {
      id: `evt_${String(sequence).padStart(6, "0")}`,
      type,
      occurredAt: new Date(occurredAt),
      subjectType,
      subjectId,
      actorType: "customer",
      traceId: "0".repeat(32),
      idempotencyKey: `${type}:${subjectId}:${sequence}`,
      payload,
    },
  });
}

describe("GET /admin/growth/stats", () => {
  it("mure la route côté staff (401 sans jeton porteur)", async () => {
    await ctx.http().get("/admin/growth/stats").expect(401);
  });

  it("dérive KPIs + entonnoirs du journal et des leads", async () => {
    await seed("user.registered", "user", "u_hot", "2026-08-10T09:00:00.000Z", { email: "h@r.fr" });
    await seed("order.placed", "user", "u_hot", "2026-08-15T09:00:00.000Z", { totalCents: 5000 });
    await seed("user.registered", "user", "u_mid", "2026-08-12T09:00:00.000Z", { email: "m@r.fr" });
    await seed("company.declared", "company", "c1", "2026-08-05T09:00:00.000Z", { via: "self" });
    await seed("company.activated", "company", "c1", "2026-08-10T09:00:00.000Z");
    await ctx.prisma.lead.create({
      data: { id: "lead_x", businessName: "Traiteur", status: "contacted" },
    });

    const stats = jsonBody<GrowthStatsView>(await staff().get("/admin/growth/stats").expect(200));
    expect(stats.kpis).toMatchObject({
      hot: 1,
      mid: 1,
      cold: 1,
      orders: 1,
      ordersTotalCents: 5000,
      companiesDeclared: 1,
      companiesActivated: 1,
      conversionRate: 1,
    });
    expect(stats.acquisition.length).toBeGreaterThan(0);
    expect(stats.activationFunnel[0]).toMatchObject({ key: "declared", count: 1 });
    expect(stats.coldFunnel[0]).toMatchObject({ key: "captured", count: 1 });
  });
});

describe("l'état du portefeuille", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  /** Le client qui passe les commandes du test — une commande a toujours un auteur. */
  async function buyer(): Promise<string> {
    const user = await createUser(ctx.prisma, { auth0Sub: `auth0|buyer-${sequence}` });
    return user.id;
  }

  /** Une commande encaissable, datée, rattachée à une société. */
  async function order(input: {
    readonly companyId: string;
    readonly daysAgo: number;
    readonly totalCents: number;
    readonly paymentStatus?: "paid" | "failed";
    readonly placedByUserId: string;
  }): Promise<void> {
    sequence += 1;
    const at = new Date(Date.now() - input.daysAgo * DAY_MS);
    await ctx.prisma.order.create({
      data: {
        id: `order_${String(sequence).padStart(4, "0")}`,
        orderNumber: `LFC-${1000 + sequence}`,
        companyId: input.companyId,
        placedByUserId: input.placedByUserId,
        status: "confirmed",
        paymentStatus: input.paymentStatus ?? "paid",
        subtotalCents: input.totalCents,
        vatCents: 0,
        totalCents: input.totalCents,
        discountCents: 0,
        deliveryFeeCents: 0,
        fulfillmentMethod: "pickup",
        createdAt: at,
      },
    });
  }

  async function portfolio(): Promise<{
    activeCompanies: number;
    activatedLast30d: number;
    failedPayments: number;
    pulse: { growing: number; flat: number; shrinking: number };
  }> {
    return jsonBody(await staff().get("/admin/growth/portfolio").expect(200));
  }

  it("compte les actifs et ceux entrés sur 30 jours", async () => {
    await ctx.prisma.company.createMany({
      data: [
        {
          reference: "C-P1",
          raisonSociale: "Ancien",
          formeJuridique: "SAS",
          siret: "11111111100011",
          contactPrenom: "A",
          contactNom: "A",
          contactEmail: "a@test.fr",
          status: "active",
          // Activée il y a un an : dans le portefeuille, hors des 30 jours.
          activatedAt: new Date(Date.now() - 365 * DAY_MS),
        },
        {
          reference: "C-P2",
          raisonSociale: "Nouveau",
          formeJuridique: "SAS",
          siret: "22222222200022",
          contactPrenom: "B",
          contactNom: "B",
          contactEmail: "b@test.fr",
          status: "active",
          activatedAt: new Date(Date.now() - 5 * DAY_MS),
        },
        {
          reference: "C-P3",
          raisonSociale: "En attente",
          formeJuridique: "SAS",
          siret: "33333333300033",
          contactPrenom: "C",
          contactNom: "C",
          contactEmail: "c@test.fr",
          status: "pending",
        },
      ],
    });

    const view = await portfolio();

    expect(view.activeCompanies).toBe(2);
    expect(view.activatedLast30d).toBe(1);
  });

  it("classe chaque compte sur sa propre variation de CA", async () => {
    const up = await ctx.prisma.company.create({
      data: {
        reference: "C-UP",
        raisonSociale: "Monte",
        formeJuridique: "SAS",
        siret: "44444444400044",
        contactPrenom: "D",
        contactNom: "D",
        contactEmail: "d@test.fr",
        status: "active",
      },
    });
    const down = await ctx.prisma.company.create({
      data: {
        reference: "C-DOWN",
        raisonSociale: "Baisse",
        formeJuridique: "SAS",
        siret: "55555555500055",
        contactPrenom: "E",
        contactNom: "E",
        contactEmail: "e@test.fr",
        status: "active",
      },
    });

    // Fenêtre précédente (J−45) puis fenêtre courante (J−5).
    const placedByUserId = await buyer();
    await order({ companyId: up.id, daysAgo: 45, totalCents: 10_000, placedByUserId });
    await order({ companyId: up.id, daysAgo: 5, totalCents: 30_000, placedByUserId });
    await order({ companyId: down.id, daysAgo: 45, totalCents: 50_000, placedByUserId });
    await order({ companyId: down.id, daysAgo: 5, totalCents: 10_000, placedByUserId });

    const view = await portfolio();

    expect(view.pulse).toEqual({ growing: 1, flat: 0, shrinking: 1 });
  });

  it("compte les encaissements en échec, commande par commande", async () => {
    const company = await ctx.prisma.company.create({
      data: {
        reference: "C-KO",
        raisonSociale: "Impayé",
        formeJuridique: "SAS",
        siret: "66666666600066",
        contactPrenom: "F",
        contactNom: "F",
        contactEmail: "f@test.fr",
        status: "active",
      },
    });
    // Deux échecs sur LE MÊME compte : deux relances, donc deux.
    const placedByUserId = await buyer();
    await order({
      companyId: company.id,
      daysAgo: 2,
      totalCents: 5_000,
      paymentStatus: "failed",
      placedByUserId,
    });
    await order({
      companyId: company.id,
      daysAgo: 1,
      totalCents: 7_000,
      paymentStatus: "failed",
      placedByUserId,
    });
    await order({ companyId: company.id, daysAgo: 1, totalCents: 9_000, placedByUserId });

    const view = await portfolio();

    expect(view.failedPayments).toBe(2);
  });

  it("est murée staff", async () => {
    await ctx.http().get("/admin/growth/portfolio").expect(401);
  });
});

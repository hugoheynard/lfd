/**
 * E2E du dashboard de croissance (`GET /admin/growth/stats`) — vrai Postgres.
 * Prouve que l'agrégat lit le journal + les leads, calcule les KPIs/entonnoirs, et
 * que la route est murée staff.
 */
import type { GrowthStatsView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/infra/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

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
  payload: Record<string, unknown> = {},
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

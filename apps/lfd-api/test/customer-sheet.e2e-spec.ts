/**
 * E2E de la **fiche client commerciale** — vrai Postgres.
 *
 * Ce que seul le vrai SQL prouve : les agrégats sont demandés à la base, sur les
 * bons statuts et les bonnes fenêtres. Une commande annulée ne compte pas, un
 * brouillon non plus, et la fenêtre des 30 jours ne déborde pas sur la
 * précédente — trois erreurs qu'un test en mémoire ne verrait jamais.
 */
import type { CustomerSheetView } from "@lfd/contracts";
import { CustomerRole, OrderStatus } from "../src/platform/database/client/client.js";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const OWNER = "auth0|owner";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

let ctx: E2eContext;

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
});

function staff(): ReturnType<E2eContext["http"]> {
  return ctx.http().set("Authorization", "Bearer staff-e2e");
}

/** Une société active, son membre, et de quoi commander. */
async function seed(): Promise<{ companyId: string; userId: string }> {
  const owner = await createUser(ctx.prisma, { auth0Sub: OWNER });
  const company = await createCompany(ctx.prisma, { status: "active" });
  await attachTo(ctx.prisma, owner.id, company.id, CustomerRole.owner);
  return { companyId: company.id, userId: owner.id };
}

/** Pose une commande `daysAgo` jours en arrière, pour un total donné. */
async function placeOrder(
  seeded: { companyId: string; userId: string },
  daysAgo: number,
  totalCents: number,
  status: OrderStatus = OrderStatus.placed,
): Promise<void> {
  const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  await ctx.prisma.order.create({
    data: {
      orderNumber: `CMD-${daysAgo}-${totalCents}-${status}`,
      companyId: seeded.companyId,
      placedByUserId: seeded.userId,
      status,
      subtotalCents: totalCents,
      totalCents,
      createdAt,
    },
  });
}

async function sheet(companyId: string): Promise<CustomerSheetView> {
  const response = await staff().get(`/admin/companies/${companyId}/customer-sheet`).expect(200);
  return jsonBody<CustomerSheetView>(response);
}

describe("la fiche client", () => {
  it("mure la route (401 sans jeton staff)", async () => {
    const { companyId } = await seed();
    await ctx.http().get(`/admin/companies/${companyId}/customer-sheet`).expect(401);
  });

  it("rend 404 sur une société inconnue", async () => {
    await staff().get("/admin/companies/cmp_inconnue/customer-sheet").expect(404);
  });

  it("porte l'identité et l'ancienneté du compte", async () => {
    const { companyId } = await seed();
    const view = await sheet(companyId);
    expect(view).toMatchObject({ companyId, status: "active" });
    expect(view.reference).toMatch(/^C-/u);
    expect(new Date(view.createdAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("somme le chiffre, compte les commandes et en tire le panier moyen", async () => {
    const seeded = await seed();
    await placeOrder(seeded, 3, 10_000);
    await placeOrder(seeded, 5, 20_000);

    const view = await sheet(seeded.companyId);
    expect(view.stats).toMatchObject({
      totalSpentCents: 30_000,
      ordersCount: 2,
      averageTicketCents: 15_000,
    });
  });

  it("EXCLUT les annulées et les brouillons — ils n'ont jamais été de l'argent", async () => {
    const seeded = await seed();
    await placeOrder(seeded, 3, 10_000);
    await placeOrder(seeded, 3, 99_000, OrderStatus.cancelled);
    await placeOrder(seeded, 3, 99_000, OrderStatus.draft);

    const view = await sheet(seeded.companyId);
    expect(view.stats).toMatchObject({ totalSpentCents: 10_000, ordersCount: 1 });
  });

  it("compare les 30 derniers jours aux 30 PRÉCÉDENTS, sans les mélanger", async () => {
    const seeded = await seed();
    await placeOrder(seeded, 10, 12_000); // fenêtre courante
    await placeOrder(seeded, 40, 10_000); // fenêtre précédente
    await placeOrder(seeded, 90, 50_000); // hors des deux

    const view = await sheet(seeded.companyId);
    expect(view.stats.trend).toMatchObject({
      last30Cents: 12_000,
      previous30Cents: 10_000,
      percent: 20,
      direction: "up",
    });
  });

  it("rend les commandes récentes, de la plus récente à la plus ancienne", async () => {
    const seeded = await seed();
    await placeOrder(seeded, 10, 10_000);
    await placeOrder(seeded, 2, 20_000);

    const view = await sheet(seeded.companyId);
    expect(view.recentOrders.map((order) => order.totalCents)).toEqual([20_000, 10_000]);
    // Les annulées RESTENT listées : le commercial doit les voir pour en parler.
    expect(view.recentOrders).toHaveLength(2);
  });

  it("remonte l'historique d'interaction depuis le JOURNAL, du plus récent au plus ancien", async () => {
    const { companyId } = await seed();
    const record = async (type: string, minutesAgo: number): Promise<void> => {
      await ctx.prisma.activityEvent.create({
        data: {
          id: `evt_${type}_${minutesAgo}`,
          type,
          occurredAt: new Date(Date.now() - minutesAgo * 60 * 1000),
          subjectType: "company",
          subjectId: companyId,
          actorType: "staff",
          traceId: "trace-e2e",
          idempotencyKey: `${type}:${minutesAgo}`,
          payload: {},
        },
      });
    };
    await record("company.declared", 120);
    await record("order.placed", 10);

    const view = await sheet(companyId);
    expect(view.timeline.map((entry) => entry.type)).toEqual(["order.placed", "company.declared"]);
    expect(view.timeline[0]?.actorType).toBe("staff");
  });

  it("n'emporte PAS le journal d'une autre société", async () => {
    const { companyId } = await seed();
    const other = await createCompany(ctx.prisma, { status: "active" });
    await ctx.prisma.activityEvent.create({
      data: {
        id: "evt_autre",
        type: "order.placed",
        occurredAt: new Date(),
        subjectType: "company",
        subjectId: other.id,
        actorType: "customer",
        traceId: "trace-e2e",
        idempotencyKey: "autre:1",
        payload: {},
      },
    });
    expect((await sheet(companyId)).timeline).toEqual([]);
  });

  it("ne compte aucun panier récurrent quand il n'y en a pas", async () => {
    const { companyId } = await seed();
    expect((await sheet(companyId)).stats.recurringBasketsCount).toBe(0);
  });
});

describe("l'état du compte", () => {
  async function change(companyId: string, action: string, reason = "motif"): Promise<number> {
    const response = await staff()
      .patch(`/admin/companies/${companyId}/status`)
      .send({ action, reason });
    return response.status;
  }

  it("suspend puis réactive un compte actif", async () => {
    const { companyId } = await seed();
    expect(await change(companyId, "suspend")).toBe(204);
    expect((await sheet(companyId)).status).toBe("suspended");

    expect(await change(companyId, "reactivate")).toBe(204);
    expect((await sheet(companyId)).status).toBe("active");
  });

  it("résilie, et REFUSE de résilier deux fois — l'état est terminal", async () => {
    const { companyId } = await seed();
    expect(await change(companyId, "terminate")).toBe(204);
    expect((await sheet(companyId)).status).toBe("terminated");
    expect(await change(companyId, "terminate")).toBe(409);
  });

  it("refuse de suspendre un compte jamais activé", async () => {
    const pending = await createCompany(ctx.prisma, { status: "pending" });
    expect(await change(pending.id, "suspend")).toBe(409);
  });

  it("exige un motif pour suspendre et pour résilier, jamais pour réactiver", async () => {
    const { companyId } = await seed();
    expect(await change(companyId, "suspend", "")).toBe(400);
    expect(await change(companyId, "suspend")).toBe(204);
    expect(await change(companyId, "reactivate", "")).toBe(204);
  });

  it("mure la route (401 sans jeton staff)", async () => {
    const { companyId } = await seed();
    await ctx
      .http()
      .patch(`/admin/companies/${companyId}/status`)
      .send({ action: "suspend", reason: "test" })
      .expect(401);
  });
});

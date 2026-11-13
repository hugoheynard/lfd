/**
 * E2E : une tentative de carte abandonnée n'est pas une commande pour les
 * statistiques de croissance (décidé par Hugo le 2026-11-13) — ni en
 * acquisition, ni dans les commandes des sociétés (cohortes, concentration).
 * Le fait `order.placed` reste au journal ; c'est la lecture qui l'écarte, et
 * la mesure de l'abandon (`order.abandoned`) reste entière.
 */
import type { AcquisitionMetricsView, GrowthStatsView } from "@lfd/contracts";

import { CardProviders } from "../src/card-payment/domain/ports/card-providers.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import {
  cardGatewayDouble,
  payByCard,
  pickupSite,
  placeOrder,
  type PlacedTestOrder,
} from "./order-factory.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

const DAY_MS = 24 * 60 * 60 * 1000;

let ctx: E2eContext;
let seq = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: CardProviders, value: cardGatewayDouble("pi_tentatives") },
    ],
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

async function member(companyId: string): Promise<{ readonly id: string; readonly sub: string }> {
  seq += 1;
  const sub = `auth0|tentative-${String(seq)}`;
  const user = await createUser(ctx.prisma, { auth0Sub: sub });
  await attachTo(ctx.prisma, user.id, companyId);
  return { id: user.id, sub };
}

async function order(
  buyerUserId: string,
  companyId: string | null,
  daysAgo: number,
  settlement: "card" | "account",
): Promise<PlacedTestOrder> {
  return placeOrder(ctx, {
    buyerUserId,
    companyId,
    placedAt: new Date(Date.now() - daysAgo * DAY_MS),
    settlement,
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    lines: [{ sku: "VIE-001-1", quantity: 10 }],
  });
}

/**
 * L'état qu'écrivent l'expiration (30 min) et la clôture sur une carte non
 * payée — `cancelled` + `failed`, le critère unique des tentatives
 * (`abandoned-attempt.where.ts`). Posé en base : ce sont les statistiques qu'on
 * éprouve ici, pas ces deux chemins.
 */
async function leaveUnpaid(placed: PlacedTestOrder): Promise<void> {
  await ctx.prisma.order.update({
    where: { id: placed.id },
    data: { status: "cancelled", paymentStatus: "failed" },
  });
}

describe("les statistiques de croissance écartent les tentatives de carte abandonnées", () => {
  it("ne compte ni l'expirée, ni la remplacée, ni la close, ni l'abandonnée", async () => {
    const company = await createCompany(ctx.prisma, {});
    await ctx.prisma.company.update({
      where: { id: company.id },
      data: { grantedTerms: ["monthly"] },
    });

    const expired = await member(company.id);
    await leaveUnpaid(await order(expired.id, company.id, 4, "card"));

    const closed = await member(company.id);
    await leaveUnpaid(await order(closed.id, company.id, 4, "card"));

    const abandoner = await member(company.id);
    // Un particulier : l'abandon d'un pro le laisse `placed` + `failed`
    // jusqu'à la clôture — encore une commande à suivre.
    const abandoned = await order(abandoner.id, null, 0, "card");
    await ctx.asSub(abandoner.sub).post(`/orders/${abandoned.id}/abandon`).expect(204);
    await ctx.drain();

    // Un particulier dont la seconde carte, réglée, remplace la première :
    // seule la seconde compte (le remplacement vaut pour la boutique).
    const replacer = await member(company.id);
    const replaced = await order(replacer.id, null, 6, "card");
    await payByCard(ctx, await order(replacer.id, null, 3, "card"));
    for (const attempt of [abandoned, replaced]) {
      expect(
        await ctx.prisma.order.findUniqueOrThrow({
          where: { id: attempt.id },
          select: { status: true, paymentStatus: true },
        }),
      ).toEqual({ status: "cancelled", paymentStatus: "failed" });
    }

    const payer = await member(company.id);
    const paid = await order(payer.id, company.id, 3, "card");
    await payByCard(ctx, paid);

    const onAccount = await member(company.id);
    const kept = await order(onAccount.id, company.id, 2, "account");

    const counted = await ctx.prisma.order.findMany({
      where: { id: { in: [paid.id, kept.id] } },
      select: { totalCents: true },
    });
    const stats = jsonBody<GrowthStatsView>(await staff().get("/admin/growth/stats").expect(200));
    expect(stats.kpis.orders).toBe(2);
    expect(stats.kpis.ordersTotalCents).toBe(counted.reduce((sum, o) => sum + o.totalCents, 0));

    const acquisition = jsonBody<AcquisitionMetricsView>(
      await staff().get("/admin/growth/acquisition-metrics").expect(200),
    );
    // Le particulier remplacé, le payeur, le client au compte.
    expect(acquisition.firstOrders.reduce((sum, n) => sum + n, 0)).toBe(3);

    // Le journal garde tout : les sept passations, et l'abandon mesuré.
    expect(await ctx.prisma.activityEvent.count({ where: { type: "order.placed" } })).toBe(7);
    expect(
      await ctx.prisma.activityEvent.count({
        where: { type: "order.abandoned", subjectId: abandoner.id },
      }),
    ).toBe(1);
  });
});

/**
 * E2E — **le balayage des paniers récurrents** par sa vraie route machine
 * (plan `plan-bloc-recurrent.md`, § 5 et § 6.1) : il passe l'échéance dont le
 * jour de passation est atteint, une seule fois, inscrit l'issue sur sa
 * ligne avec son fait durable, et laisse les paniers perso de côté.
 */
import { PERSONAL_WORKSPACE } from "@lfd/contracts";

import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, serviceDay, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { pickupSite } from "./order-factory.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";
import {
  occurrenceStates,
  openBasket,
  publishSalesTerms,
  sweep,
  weeklyBasket,
} from "./recurring-scene.js";

const BUYER = "auth0|sweep-buyer";
/**
 * Dans deux jours : dans l'horizon de passation, et loin de l'heure limite à
 * toute heure de la journée. L'échéance suivante (neuf jours) est hors de
 * l'horizon.
 */
const FIRST = serviceDay(2);

let ctx: E2eContext;
let companyId = "";
let pickupId = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await publishSalesTerms(ctx);
  pickupId = await pickupSite(ctx.prisma);
  companyId = (await createCompany(ctx.prisma, { status: CompanyStatus.active })).id;
  await ctx.prisma.company.update({
    where: { id: companyId },
    data: { grantedTerms: ["monthly"] },
  });
  const buyer = await createUser(ctx.prisma, { auth0Sub: BUYER });
  await attachTo(ctx.prisma, buyer.id, companyId, CustomerRole.owner);
});

const open = (workspace: string): Promise<string> =>
  openBasket(ctx, BUYER, workspace, weeklyBasket({ pickupAddressId: pickupId }));

/** La boîte d'envoi relayée comme le cron du Worker, puis le travail de fond vidé. */
async function relayOutbox(): Promise<void> {
  await ctx
    .http()
    .post("/admin/outbox/sweep")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  await ctx.drain();
}

describe("le balayage des échéances dues", () => {
  it("passe l'échéance de l'horizon une seule fois, l'inscrit, et écrit son fait", async () => {
    const id = await open(companyId);

    expect(await sweep(ctx)).toMatchObject({
      due: 1,
      placed: 1,
      refused: 0,
      missed: 0,
      failed: 0,
    });
    const orders = await ctx.prisma.order.findMany({ where: { fromSubscriptionId: id } });
    expect(orders).toHaveLength(1);
    const placed = await ctx.prisma.occurrence.findFirstOrThrow({
      where: { basketId: id, state: "placed" },
    });
    expect(placed.orderId).toBe(orders[0]?.id);
    expect(placed.settledAt).not.toBeNull();
    expect((await occurrenceStates(ctx, id))[0]).toEqual([FIRST, "placed"]);
    expect(
      await ctx.prisma.outboxMessage.count({ where: { type: "recurring.occurrence_placed" } }),
    ).toBe(1);

    expect(await sweep(ctx)).toMatchObject({ due: 0, placed: 0 });
    expect(await ctx.prisma.order.count({ where: { fromSubscriptionId: id } })).toBe(1);
  });

  it("refuse sans crédit, alerte une fois, n'écrit le fait qu'une fois, puis passe la cause levée", async () => {
    const id = await open(companyId);
    await ctx.prisma.company.update({ where: { id: companyId }, data: { grantedTerms: [] } });

    const first = await sweep(ctx);
    expect(first).toMatchObject({ placed: 0, refused: 1 });
    expect(first.alerts.map((alert) => [alert.date, alert.cause])).toEqual([
      [FIRST, "no_settlement"],
    ]);
    expect((await sweep(ctx)).alerts).toEqual([]);
    expect(
      await ctx.prisma.outboxMessage.count({ where: { type: "recurring.occurrence_refused" } }),
    ).toBe(1);
    expect((await occurrenceStates(ctx, id))[0]).toEqual([FIRST, "refused"]);

    // R5 : le fait de refus sonne pour ceux qui gèrent les paniers — une seule
    // fois, même relayé deux fois.
    await relayOutbox();
    await relayOutbox();
    expect(
      await ctx.prisma.staffNotification.findMany({
        where: { kind: "recurring.occurrence_refused" },
        select: { audience: true, link: true },
      }),
    ).toEqual([
      {
        audience: "b2b_subscriptions:read",
        link: `/comptes-clients/${companyId}/paniers-recurrents`,
      },
    ]);

    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { grantedTerms: ["monthly"] },
    });
    expect(await sweep(ctx)).toMatchObject({ placed: 1 });
    expect(
      await ctx.prisma.occurrence.findFirstOrThrow({ where: { basketId: id, state: "placed" } }),
    ).toMatchObject({ cause: null, reason: null });
  });

  it("un panier en pause n'est pas balayé", async () => {
    const id = await open(companyId);
    await ctx
      .asSub(BUYER)
      .patch(`/subscriptions/${id}/status`)
      .send({ status: "paused" })
      .expect(204);

    expect(await sweep(ctx)).toMatchObject({ due: 0, placed: 0 });
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it("laisse les paniers perso de côté", async () => {
    await open(PERSONAL_WORKSPACE);

    expect(await sweep(ctx)).toMatchObject({ due: 0, placed: 0 });
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it("refuse la machine sans son jeton", async () => {
    await ctx.http().post("/admin/subscriptions/sweep").expect(401);
  });
});

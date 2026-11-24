/**
 * E2E — **le balayage du planificateur** (plan, lot R4) par sa vraie route
 * machine : il arme un panier neuf, passe l'échéance de l'horizon une seule
 * fois, et laisse les paniers perso de côté.
 */
import { PERSONAL_WORKSPACE, WORKSPACE_HEADER } from "@lfd/contracts";

import type { RecurringOccurrencesSweepReport } from "../src/lafoliecoffee/subscriptions/application/commands/sweep-recurring-occurrences.command.js";
import type { CreatedSubscription } from "../src/lafoliecoffee/subscriptions/domain/ports/subscription.repository.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { pickupSite } from "./order-factory.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const BUYER = "auth0|sweep-buyer";
/**
 * Dans deux jours : dans l'horizon, et loin de l'heure limite à toute heure
 * de la journée. L'échéance suivante (neuf jours) est hors de l'horizon.
 */
const FIRST = serviceDay(2);

let ctx: E2eContext;
let companyId = "";
let pickupId = "";

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  pickupId = await pickupSite(ctx.prisma);
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  companyId = company.id;
  await ctx.prisma.company.update({
    where: { id: companyId },
    data: { grantedTerms: ["monthly"] },
  });
  const buyer = await createUser(ctx.prisma, { auth0Sub: BUYER });
  await attachTo(ctx.prisma, buyer.id, companyId, CustomerRole.owner);
});

async function openBasket(workspace: string): Promise<string> {
  const response = await ctx
    .asSub(BUYER)
    .post("/subscriptions")
    .set(INTENT_KEY, freshIntent())
    .set(WORKSPACE_HEADER, workspace)
    .send({
      fromOrderId: null,
      recurrence: "weekly",
      startDate: FIRST,
      endDate: null,
      fulfillmentMethod: "pickup",
      deliveryAddress: null,
      pickupAddressId: pickupId,
      requestedWindow: { start: "07:00", end: "08:00" },
      lines: [{ sku: "VIE-001-1", quantity: 6 }],
      note: "",
    })
    .expect(201);
  return jsonBody<CreatedSubscription>(response).id;
}

async function sweep(): Promise<RecurringOccurrencesSweepReport> {
  const response = await ctx
    .http()
    .post("/admin/subscriptions/sweep")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  return jsonBody<RecurringOccurrencesSweepReport>(response);
}

describe("le balayage du planificateur", () => {
  it("arme le panier neuf et passe son échéance de l'horizon, une seule fois", async () => {
    const id = await openBasket(companyId);

    expect(await sweep()).toMatchObject({
      subscriptions: 1,
      armed: 1,
      generated: 1,
      refused: 0,
      missed: 0,
      failed: 0,
    });
    const orders = await ctx.prisma.order.findMany({ where: { fromSubscriptionId: id } });
    expect(orders).toHaveLength(1);
    expect(
      (await ctx.prisma.subscription.findUniqueOrThrow({ where: { id } })).armedFrom,
    ).not.toBeNull();

    expect(await sweep()).toMatchObject({ subscriptions: 1, armed: 0, generated: 0 });
    expect(await ctx.prisma.order.count({ where: { fromSubscriptionId: id } })).toBe(1);
  });

  it("refuse sans crédit, dit la cause une fois, et ne la redit pas", async () => {
    await openBasket(companyId);
    await ctx.prisma.company.update({ where: { id: companyId }, data: { grantedTerms: [] } });

    const first = await sweep();
    expect(first).toMatchObject({ generated: 0, refused: 1 });
    expect(first.alerts.map((alert) => [alert.date, alert.cause])).toEqual([
      [FIRST, "no_settlement"],
    ]);
    expect((await sweep()).alerts).toEqual([]);
  });

  it("laisse les paniers perso de côté", async () => {
    await openBasket(PERSONAL_WORKSPACE);

    expect(await sweep()).toMatchObject({ subscriptions: 0, generated: 0 });
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it("refuse la machine sans son jeton", async () => {
    await ctx.http().post("/admin/subscriptions/sweep").expect(401);
  });
});

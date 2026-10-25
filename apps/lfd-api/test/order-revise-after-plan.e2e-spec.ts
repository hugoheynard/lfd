/**
 * **Changer les quantités d'une commande inscrite** (plan A2,
 * `documentation/commandes/modification/plan-a2-modifier-une-commande-inscrite.md`,
 * § 7) — de la route staff jusqu'au fournil, au colisage et au BL, sur le
 * vrai Postgres : le dû révisé dans les deux sens, le compte du four qui ne
 * baisse jamais, les refus nommés.
 */
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import {
  closeOrder,
  closePlan,
  CROISSANT,
  bootstrapProductionDay,
  relayGate,
  releaseRelay,
  SERVICE_DAY,
} from "./production-day-fixture.js";
import { accountOrder } from "./shortfall-decision-scene.js";
import { pickupSite, placeOrderForCustomer } from "./order-factory.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { DeferredTerm } from "../src/platform/database/client/client.js";
import { E2E_STAFF_ID } from "./e2e-harness.js";
import {
  bakeryDueOf,
  codeOf,
  liveNoteOf,
  ovenCount,
  packingDueOf,
  reviseQuantity,
} from "./order-revise-after-plan-scene.js";

let ctx: E2eContext;

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  relayGate.open = true;
  await ctx.reset();
});

describe("la hausse", () => {
  it("le dû, le compte du four, la feuille et le BL prévu montent ensemble", async () => {
    const order = await accountOrder(ctx, 0);
    const before = await liveNoteOf(ctx, order.id);
    expect(await ovenCount(ctx)).toBe(3);

    const response = await reviseQuantity(ctx, order.id, 5);
    await ctx.drain();

    expect(response.status).toBe(200);
    expect(await bakeryDueOf(ctx, order.id)).toBe(5);
    expect(await ovenCount(ctx)).toBe(5);
    expect(await packingDueOf(ctx, order.id)).toBe(5);
    expect(await liveNoteOf(ctx, order.id)).toEqual({
      status: "planned",
      contentVersion: (before?.contentVersion ?? 1) + 1,
      quantity: 5,
    });
    const raised = await ctx.prisma.outboxMessage.findMany({
      where: { type: "production.order_quantities_raised", key: { contains: order.id } },
      select: { payload: true },
    });
    expect(raised).toHaveLength(1);
    expect(raised[0]?.payload).toMatchObject({
      lines: [expect.objectContaining({ sku: CROISSANT, from: 3, to: 5 })],
    });
    expect(
      await ctx.prisma.activityEvent.count({
        where: { type: "packing_sheet.revised", subjectId: order.id },
      }),
    ).toBe(1);
  });
});

describe("la baisse", () => {
  /** Régression gardée (plan A2, § 7, B3) : une baisse ne fait pas baisser le compte du four. */
  it("le dû et la feuille baissent, le compte du four reste — aucun fait de hausse", async () => {
    const order = await accountOrder(ctx, 1);

    const response = await reviseQuantity(ctx, order.id, 2);
    await ctx.drain();

    expect(response.status).toBe(200);
    expect(await bakeryDueOf(ctx, order.id)).toBe(2);
    expect(await ovenCount(ctx)).toBe(3);
    expect(await packingDueOf(ctx, order.id)).toBe(2);
    expect(
      await ctx.prisma.outboxMessage.count({
        where: { type: "production.order_quantities_raised" },
      }),
    ).toBe(0);
  });

  it("sous ce qui est déjà au bac : refusée, rien n'a bougé", async () => {
    const order = await accountOrder(ctx, 3);

    const response = await reviseQuantity(ctx, order.id, 2);

    expect(response.status).toBe(409);
    expect(codeOf(response)).toBe("packing.revision.below_packed");
    expect(await bakeryDueOf(ctx, order.id)).toBe(3);
    expect(await packingDueOf(ctx, order.id)).toBe(3);
  });
});

describe("les refus nommés", () => {
  it("autre chose que des quantités après l'arrêt : refusé", async () => {
    const order = await accountOrder(ctx, 0);

    const response = await reviseQuantity(ctx, order.id, 3, { note: "Sonner deux fois" });

    expect(response.status).toBe(409);
    expect(codeOf(response)).toBe("orders.revise.quantities_only");
  });

  it("un article ajouté après l'arrêt : refusé", async () => {
    const order = await accountOrder(ctx, 0);

    const response = await reviseQuantity(ctx, order.id, 3, {
      lines: [
        { sku: CROISSANT, quantity: 3 },
        { sku: "VIE-002", quantity: 1 },
      ],
    });

    expect(response.status).toBe(409);
    expect(codeOf(response)).toBe("orders.revise.quantities_only");
  });

  it("la feuille du colisage pas encore écrite : refus temporaire, puis accepté", async () => {
    const company = await createCompany(ctx.prisma);
    await ctx.prisma.company.update({
      where: { id: company.id },
      data: { grantedTerms: [DeferredTerm.monthly] },
    });
    const buyer = await createUser(ctx.prisma, { auth0Sub: "auth0|a2-buyer" });
    await attachTo(ctx.prisma, buyer.id, company.id);
    const placed = await placeOrderForCustomer(ctx, {
      buyerUserId: buyer.id,
      companyId: company.id,
      staffUserId: E2E_STAFF_ID,
      settlement: "account",
      forDay: SERVICE_DAY,
      fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
      lines: [{ sku: CROISSANT, quantity: 3 }],
    });
    relayGate.open = false;
    await closePlan(ctx);

    const early = await reviseQuantity(ctx, placed.id, 4);
    expect(early.status).toBe(409);
    expect(codeOf(early)).toBe("orders.revise.packing_not_drawn");

    await releaseRelay(ctx);
    expect((await reviseQuantity(ctx, placed.id, 4)).status).toBe(200);
  });

  it("une commande prête : refusée par la règle commune", async () => {
    const order = await accountOrder(ctx, 3);
    expect(await closeOrder(ctx, order.id)).toBe(204);
    await ctx.drain();

    const response = await reviseQuantity(ctx, order.id, 4);

    expect(response.status).toBe(409);
    expect(["orders.revise.ready", "orders.revise.packed"]).toContain(codeOf(response));
  });

  it("l'écran le dit : modifiable, en quantités seulement", async () => {
    const order = await accountOrder(ctx, 0);

    const view = jsonBody<{ revisability: { revisable: boolean; quantitiesOnly?: string } }>(
      await ctx.asSub("staff-e2e").get(`/admin/orders/${order.id}`).expect(200),
    );

    expect(view.revisability.revisable).toBe(true);
    expect(view.revisability.quantitiesOnly).toContain("seules les quantités");
  });
});

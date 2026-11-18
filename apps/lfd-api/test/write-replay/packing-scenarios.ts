import { serviceDay, type E2eContext } from "../e2e-harness.js";
import { createUser } from "../factories.js";
import { INTENT_KEY, freshIntent } from "../intent-key.js";
import { payByCard, placeOrder } from "../order-factory.js";
import { CROISSANT, closePlan, packingOrderPath, recordBatch } from "../production-day-fixture.js";
import { routeKey, STAFF, type ScenarioSet } from "./scenario.js";
import { pickupPoint } from "./seeds.js";

const CONTROLLER = "packing/http/packing-orders.controller.ts";

/**
 * Un retrait de trois croissants payé, plan arrêté, le four en a remis trois :
 * la commande est au colisage simple (le réglage par défaut d'un retrait).
 */
async function simplePickupOrder(ctx: E2eContext): Promise<string> {
  const buyer = await createUser(ctx.prisma, { auth0Sub: "replay-colisage", firstName: "Léa" });
  const order = await placeOrder(ctx, {
    buyerUserId: buyer.id,
    forDay: serviceDay(),
    fulfillment: { method: "pickup", pickupSiteId: await pickupPoint(ctx) },
    lines: [{ sku: CROISSANT, quantity: 3 }],
  });
  await payByCard(ctx, order);
  await closePlan(ctx);
  await ctx.drain();
  expect(await recordBatch(ctx, "01K6A0000000000000000000B1", 3)).toBe(204);
  await ctx.drain();
  return order.id;
}

/** Les gestes du colisage simple par intention (`colisage/colisage.md`). */
export const PACKING_SCENARIOS: ScenarioSet = {
  [routeKey(CONTROLLER, "declareAllReady")]: async ({ ctx }) => ({
    sub: STAFF,
    path: `${packingOrderPath(await simplePickupOrder(ctx))}/all-ready`,
  }),

  [routeKey(CONTROLLER, "reportProblem")]: async ({ ctx }) => ({
    sub: STAFF,
    path: `${packingOrderPath(await simplePickupOrder(ctx))}/problem`,
    body: { lines: [{ sku: CROISSANT, present: 1 }] },
  }),

  [routeKey(CONTROLLER, "recoverFound")]: async ({ ctx }) => {
    const path = packingOrderPath(await simplePickupOrder(ctx));
    await ctx
      .asSub(STAFF)
      .post(`${path}/problem`)
      .set(INTENT_KEY, freshIntent())
      .send({ lines: [{ sku: CROISSANT, present: 1 }] })
      .expect(204);
    await ctx.drain();
    return {
      sub: STAFF,
      path: `${path}/found`,
      body: { lines: [{ sku: CROISSANT, quantity: 2 }] },
    };
  },
};

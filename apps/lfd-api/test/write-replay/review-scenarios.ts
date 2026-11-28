import { ORDER_REVIEW_STARTS_AT } from "../../src/lafoliecoffee/orders/domain/services/order-review-start.js";
import { serviceDay } from "../e2e-harness.js";
import { INTENT_KEY, freshIntent } from "../intent-key.js";
import { placeOrder } from "../order-factory.js";
import { routeKey, STAFF, staffOf, type ReplayWorld, type ScenarioSet } from "./scenario.js";
import { companyWithOwner, pickupPoint } from "./seeds.js";

const CONTROLLER = "lafoliecoffee/orders/http/admin-order-review.controller.ts";

/** Une commande qu'un client pro a passée seul, après la mise en service du visa. */
async function proOrderToReview(world: ReplayWorld): Promise<string> {
  const { ctx } = world;
  const pickupSiteId = await pickupPoint(ctx);
  const { companyId, ownerId } = await companyWithOwner(ctx, "auth0|replay-review");
  const placed = await placeOrder(ctx, {
    buyerUserId: ownerId,
    companyId,
    fulfillment: { method: "pickup", pickupSiteId },
    // Régression : le jour déduit de `placedAt` (fixe) passait, et le visa refusait `SameDayOrderClosedError`.
    forDay: serviceDay(),
    // Comparée à la mise en service, jamais à l'horloge du scénario.
    placedAt: new Date(ORDER_REVIEW_STARTS_AT.getTime() + 60_000),
  });
  return placed.id;
}

/** Le visa des commandes : vérifier, puis retirer la vérification. */
export const REVIEW_SCENARIOS: ScenarioSet = {
  [routeKey(CONTROLLER, "review")]: async (world) => ({
    sub: STAFF,
    path: `/admin/orders/${await proOrderToReview(world)}/review`,
    body: { note: "Quantités habituelles." },
  }),
  [routeKey(CONTROLLER, "withdraw")]: async (world) => {
    const orderId = await proOrderToReview(world);
    await staffOf(world.ctx)()
      .post(`/admin/orders/${orderId}/review`)
      .set(INTENT_KEY, freshIntent())
      .send({})
      .expect(204);
    return { sub: STAFF, path: `/admin/orders/${orderId}/review/withdraw`, body: {} };
  },
};

import { REFUND_SHORTFALL_ON_BILLING_SETTLED } from "../../src/lafoliecoffee/orders/application/handlers/refund-shortfall-on-billing-settled.handler.js";
import { OutboxRelay } from "../../src/platform/outbox/outbox-relay.js";
import { MAX_DELIVERY_ATTEMPTS } from "../../src/platform/outbox/retry-policy.js";
import { serviceDay, type E2eContext } from "../e2e-harness.js";
import { createUser } from "../factories.js";
import { handOver, payByCard, pickupSite, placeOrder } from "../order-factory.js";
import { closeOrder, CROISSANT, MEMBER, SERVICE_DAY } from "../production-day-fixture.js";
import { decide, drawn, report } from "../shortfall-decision-scene.js";
import { cards } from "./doubles.js";
import { routeKey, STAFF, type ScenarioSet } from "./scenario.js";
import { pickupPoint } from "./seeds.js";

/** Les tours de relais qui suffisent à la remise (retrait, solde, abonnés). */
const RELAY_ROUNDS = 4;

/**
 * Remet la commande sans laisser l'abonné du reste demander : le relais est
 * mené à la main, et chaque livraison de cet abonné est passée en lettre
 * morte avant d'être prise — l'état où « Rembourser le reste » est le geste
 * (plan `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 4.5).
 */
async function handOverWithRefundSubscriberDead(
  ctx: E2eContext,
  order: Parameters<typeof handOver>[1],
): Promise<void> {
  const relay = ctx.app.get(OutboxRelay);
  const wake = relay.wake.bind(relay);
  relay.wake = (): void => undefined;
  try {
    await handOver(ctx, order);
    for (let round = 0; round < RELAY_ROUNDS; round += 1) {
      await ctx.prisma.outboxDelivery.updateMany({
        where: { subscriber: REFUND_SHORTFALL_ON_BILLING_SETTLED, deliveredAt: null },
        data: { attempts: MAX_DELIVERY_ATTEMPTS },
      });
      await relay.sweep();
      await ctx.drain();
    }
  } finally {
    relay.wake = wake;
  }
}

/** L'encaissement par carte : « Relancer » un remboursement arrêté ; « Rembourser le reste ». */
export const CARD_PAYMENT_SCENARIOS: ScenarioSet = {
  [routeKey("card-payment/http/admin-card-refunds.controller.ts", "retry")]: async ({ ctx }) => {
    const buyer = await createUser(ctx.prisma, { auth0Sub: "replay-card", firstName: "Léa" });
    const pickupId = await pickupPoint(ctx);
    const order = await placeOrder(ctx, {
      buyerUserId: buyer.id,
      forDay: serviceDay(),
      fulfillment: { method: "pickup", pickupSiteId: pickupId },
    });
    await payByCard(ctx, order);
    // Le prestataire refuse le premier remboursement : la demande s'arrête,
    // et « Relancer » devient le geste.
    cards.provider.refundIssuances.push({ kind: "declined", code: "charge_disputed" });
    await ctx
      .asSub(STAFF)
      .post(`/admin/orders/${order.id}/cancel`)
      .send({ reason: "Le client a appelé : il part en vacances" })
      .expect(204);
    await ctx.app.get(OutboxRelay).sweep();
    await ctx.drain();
    const request = await ctx.prisma.cardRefundRequest.findFirstOrThrow({
      where: { state: "stopped" },
    });
    return { sub: STAFF, path: `/admin/card-payments/refund-requests/${request.id}/retry` };
  },
  [routeKey("lafoliecoffee/orders/http/admin-order-shortfall-refund.controller.ts", "refund")]:
    async ({ ctx }) => {
      const buyer = await createUser(ctx.prisma, { auth0Sub: MEMBER });
      const placed = await placeOrder(ctx, {
        buyerUserId: buyer.id,
        forDay: SERVICE_DAY,
        fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
        lines: [{ sku: CROISSANT, quantity: 3 }],
      });
      await payByCard(ctx, placed);
      const order = await drawn(ctx, placed, 1);
      expect(await report(ctx, order.id)).toBe(204);
      expect((await decide(ctx, order.id)).status).toBe(204);
      expect(await closeOrder(ctx, order.id)).toBe(204);
      await ctx.drain();
      await handOverWithRefundSubscriberDead(ctx, order);
      return { sub: STAFF, path: `/admin/orders/${order.id}/shortfall-refund` };
    },
};

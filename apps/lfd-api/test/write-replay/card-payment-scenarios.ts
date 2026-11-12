import { OutboxRelay } from "../../src/platform/outbox/outbox-relay.js";
import { serviceDay } from "../e2e-harness.js";
import { createUser } from "../factories.js";
import { payByCard, placeOrder } from "../order-factory.js";
import { cards } from "./doubles.js";
import { routeKey, STAFF, type ScenarioSet } from "./scenario.js";
import { pickupPoint } from "./seeds.js";

/** L'encaissement par carte : « Relancer » un remboursement arrêté. */
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
};

/**
 * E2E du **reste d'un départ incomplet payé par carte, remboursé au solde**
 * (plan `documentation/commandes/reliquat/plan-e9-reste-carte.md`, lot E9a).
 *
 * Ce que seul le vrai SQL prouve : une carte ENCAISSÉE se décide ; à la
 * remise, le solde posé publie `order.billing_settled`, et l'abonné du reste
 * écrit, par la vraie boîte d'envoi, UNE demande `amount` de raison
 * `shortfall` au bloc `card-payment`, du montant encaissé − facturable ;
 * relivré, il n'en écrit pas de seconde ; la fiche commande ne montre plus
 * « Rembourser le reste », et le geste rend un 409 nommé. Le prestataire est
 * doublé.
 */
import type { AdminOrderView } from "@lfd/contracts";

import { REFUND_SHORTFALL_ON_BILLING_SETTLED } from "../src/lafoliecoffee/orders/application/handlers/refund-shortfall-on-billing-settled.handler.js";
import { OutboxRelay } from "../src/platform/outbox/outbox-relay.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { settleCardPayments } from "./card-payments.js";
import { handOver, pickupSite, placeOrder } from "./order-factory.js";
import {
  bootstrapProductionDay,
  closeOrder,
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
} from "./production-day-fixture.js";
import { decide, drawn, report, type Drawn } from "./shortfall-decision-scene.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";

let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** La boîte d'envoi, relayée jusqu'au calme. */
async function relayAll(): Promise<void> {
  const relay = ctx.app.get(OutboxRelay);
  for (let round = 0; round < 4; round += 1) {
    await relay.sweep();
    await ctx.drain();
  }
}

/** Une commande par carte de 3 croissants, encaissée, tirée, `packed` au sac. */
async function paidCardOrder(packed: number): Promise<Drawn> {
  const buyer = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  const placed = await placeOrder(ctx, {
    buyerUserId: buyer.id,
    forDay: SERVICE_DAY,
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    lines: [{ sku: CROISSANT, quantity: 3 }],
  });
  await settleCardPayments(ctx, issued);
  return drawn(ctx, placed, packed);
}

/** La même, 1 au sac, le manque signalé. */
async function paidCardShortfall(): Promise<Drawn> {
  const order = await paidCardOrder(1);
  expect(await report(ctx, order.id)).toBe(204);
  return order;
}

async function shortfallRequests(orderId: string) {
  const payments = await ctx.prisma.cardPayment.findMany({
    where: { subjectType: "order", subjectId: orderId },
    select: { id: true, amountCents: true },
  });
  const requests = await ctx.prisma.cardRefundRequest.findMany({
    where: { paymentId: { in: payments.map((payment) => payment.id) }, reason: "shortfall" },
  });
  return { payments, requests };
}

describe("Le reste d'une carte encaissée, remboursé au solde (plan E9, lot E9a)", () => {
  it("décide, remet, et demande à la carte encaissé − facturable — une fois, même relivré", async () => {
    const order = await paidCardShortfall();

    expect((await decide(ctx, order.id)).status).toBe(204);
    expect(await closeOrder(ctx, order.id)).toBe(204);
    await ctx.drain();
    await handOver(ctx, order);
    await relayAll();

    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const { payments, requests } = await shortfallRequests(order.id);
    const charged = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
    expect(row.billableTotalCents).not.toBeNull();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      form: "amount",
      nature: "adjustment",
      announcedCents: charged - (row.billableTotalCents ?? 0),
      requestedBy: null,
    });

    // Relivré : le reste relu sous le verrou retranche la demande ouverte.
    const redelivered = await ctx.prisma.outboxDelivery.updateMany({
      where: { subscriber: REFUND_SHORTFALL_ON_BILLING_SETTLED },
      data: { deliveredAt: null, attempts: 0, claimedUntil: null, nextAttemptAt: new Date(0) },
    });
    expect(redelivered.count).toBe(1);
    await relayAll();
    expect((await shortfallRequests(order.id)).requests).toHaveLength(1);

    const fiche = jsonBody<AdminOrderView>(
      await ctx.asSub(STAFF).get(`/admin/orders/${order.id}`).expect(200),
    );
    expect(fiche.shortfallRefund).toBeNull();
    const refused = await ctx
      .asSub(STAFF)
      .post(`/admin/orders/${order.id}/shortfall-refund`)
      .set(INTENT_KEY, freshIntent())
      .expect(409);
    expect(jsonBody<{ code: string }>(refused).code).toBe("orders.shortfall_refund.nothing");
  });

  it("une commande complète, remise : aucune demande du reste", async () => {
    const order = await paidCardOrder(3);

    expect(await closeOrder(ctx, order.id)).toBe(204);
    await ctx.drain();
    await handOver(ctx, order);
    await relayAll();

    expect((await shortfallRequests(order.id)).requests).toEqual([]);
  });
});

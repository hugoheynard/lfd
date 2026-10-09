/**
 * E2E des **commandes boutique non réglées** (plan
 * `documentation/order/plan-commandes-non-reglees.md`, §3, §4) : deux essais
 * de paiement ne laissent qu'une commande visible, et le cron annule ce qui
 * reste en l'air au-delà de trente minutes.
 *
 * Stripe est la seule frontière doublée : chaque annulation d'intention rend
 * `cancelled`. Le reste — le `where` du périmètre, le bus, l'abonné de
 * remplacement, la liste « Mes commandes » — tourne sur le vrai Postgres.
 *
 * Les commandes sont semées par Prisma, faute d'agrégat qui sache écrire une
 * commande à un état donné (même dette que `order-abandon.e2e-spec.ts`). La
 * passation est représentée par son FAIT, `OrderPlacedEvent`, publié sur le
 * vrai bus : c'est lui, et lui seul, que le remplacement écoute.
 */
import { CommandBus, EventBus } from "@nestjs/cqrs";

import { ConfirmOrderPaymentCommand } from "../src/b2b/orders/application/commands/confirm-order-payment.command.js";
import { OrderPlacedEvent } from "../src/b2b/orders/domain/events/order-placed.event.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import {
  OrderClientele,
  OrderStatus,
  PaymentStatus,
} from "../src/platform/database/client/client.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const cancelledIntents: string[] = [];
const fakeGateway = {
  createIntent: () => Promise.reject(new Error("non utilisé")),
  retrieveIntent: () => Promise.reject(new Error("non utilisé")),
  cancelIntent: (id: string) => {
    cancelledIntents.push(id);
    return Promise.resolve({ kind: "cancelled" as const });
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
};

const sentTemplates: string[] = [];
const recordingMailer = {
  enabled: true,
  send: (args: { readonly template: string }): Promise<{ providerId: null }> => {
    sentTemplates.push(args.template);
    return Promise.resolve({ providerId: null });
  },
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: PaymentGateway, value: fakeGateway },
      { token: MAILER, value: recordingMailer },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  cancelledIntents.splice(0);
  sentTemplates.splice(0);
});

const BUYER = "auth0|non-reglee-acheteur";
const MINUTES_PER_DAY = 24 * 60;
const ROUTE = "/admin/orders/unsettled-shop-orders/expire";

let seq = 0;

/** Une commande boutique, carte en attente, passée il y a `minutes`. */
async function seedPending(userId: string, minutes: number) {
  seq += 1;
  const intent = `pi_non_reglee_${String(seq)}`;
  const order = await ctx.prisma.order.create({
    data: {
      orderNumber: `CMD-NONREGLEE-${String(seq)}`,
      placedByUserId: userId,
      companyId: null,
      clientele: OrderClientele.public,
      status: OrderStatus.placed,
      subtotalCents: 2_000,
      totalCents: 2_110,
      vatCents: 110,
      paymentStatus: PaymentStatus.pending,
      stripePaymentIntentId: intent,
      createdAt: daysAgo(minutes / MINUTES_PER_DAY),
    },
    select: { id: true, orderNumber: true },
  });
  return { ...order, intent };
}

async function stateOf(orderId: string) {
  return ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true, paymentStatus: true },
  });
}

async function myOrderIds(): Promise<readonly string[]> {
  const response = await ctx.asSub(BUYER).get("/orders/mine").expect(200);
  return jsonBody<readonly { readonly id: string }[]>(response).map((order) => order.id);
}

describe("deux essais, un paiement", () => {
  it("ne laisse qu'une commande visible dans « Mes commandes »", async () => {
    const buyer = await createUser(ctx.prisma, { auth0Sub: BUYER });
    const first = await seedPending(buyer.id, 3);
    const second = await seedPending(buyer.id, 0);

    // La seconde passation : son fait déclenche le remplacement de la première.
    ctx.app
      .get(EventBus)
      .publish(new OrderPlacedEvent(second.id, second.orderNumber, buyer.id, null, 2_110));
    await ctx.drain();
    await ctx.app
      .get(CommandBus)
      .execute(new ConfirmOrderPaymentCommand(second.intent, "succeeded"));
    await ctx.drain();

    expect(cancelledIntents).toEqual([first.intent]);
    expect(await stateOf(first.id)).toEqual({
      status: OrderStatus.cancelled,
      paymentStatus: PaymentStatus.failed,
    });
    expect(await myOrderIds()).toEqual([second.id]);
    expect(sentTemplates).not.toContain("customer.payment-expired");
  });
});

describe("POST /admin/orders/unsettled-shop-orders/expire — le cron", () => {
  it("annule à 31 minutes, garde à 29, et ne touche pas une commande payée", async () => {
    const buyer = await createUser(ctx.prisma, { auth0Sub: BUYER });
    const lapsed = await seedPending(buyer.id, 31);
    const young = await seedPending(buyer.id, 29);
    const paid = await seedPending(buyer.id, 45);
    await ctx.prisma.order.update({
      where: { id: paid.id },
      data: { paymentStatus: PaymentStatus.paid },
    });

    const response = await ctx
      .http()
      .post(ROUTE)
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);
    await ctx.drain();

    expect(jsonBody<{ readonly cancelled: number }>(response).cancelled).toBe(1);
    expect(cancelledIntents).toEqual([lapsed.intent]);
    expect((await stateOf(young.id)).status).toBe(OrderStatus.placed);
    expect(await stateOf(paid.id)).toEqual({
      status: OrderStatus.placed,
      paymentStatus: PaymentStatus.paid,
    });
    expect(await myOrderIds()).not.toContain(lapsed.id);
  });

  it("refuse sans jeton", async () => {
    await ctx.http().post(ROUTE).expect(401);
  });
});

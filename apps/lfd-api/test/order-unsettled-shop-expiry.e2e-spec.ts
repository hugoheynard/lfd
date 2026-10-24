/**
 * E2E des **commandes boutique non réglées** (plan
 * `documentation/commandes/reglement/commande-carte-reglee.md`, §3, §4) : deux essais
 * de paiement ne laissent qu'une commande visible, et le cron annule ce qui
 * reste en l'air au-delà de trente minutes.
 *
 * Stripe est la seule frontière doublée : chaque annulation d'intention rend
 * `cancelled`. Le reste — le `where` du périmètre, le bus, l'abonné de
 * remplacement, la liste « Mes commandes » — tourne sur le vrai Postgres.
 *
 * Les commandes sont passées par le vrai chemin (`placeOrder`, plan T) : la
 * passation publie elle-même `OrderPlacedEvent`, le fait que le remplacement
 * écoute. Un particulier distinct par commande là où le remplacement ne doit
 * pas jouer.
 */
import { CommandBus } from "@nestjs/cqrs";

import { ConfirmOrderPaymentCommand } from "../src/b2b/orders/application/commands/confirm-order-payment.command.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { OrderStatus, PaymentStatus } from "../src/platform/database/client/client.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { pickupSite, placeOrder } from "./order-factory.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const cancelledIntents: string[] = [];
let issuedIntents = 0;
const fakeGateway = {
  createIntent: () => {
    issuedIntents += 1;
    const paymentIntentId = `pi_non_reglee_${String(issuedIntents)}`;
    return Promise.resolve({ paymentIntentId, clientSecret: `${paymentIntentId}_secret` });
  },
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

/** Une commande boutique, carte en attente, passée il y a `minutes`. */
async function seedPending(userId: string, minutes: number) {
  const order = await placeOrder(ctx, {
    buyerUserId: userId,
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    placedAt: new Date(daysAgo(minutes / MINUTES_PER_DAY)),
  });
  if (order.paymentIntentId === null) {
    throw new Error("Une commande personnelle à la carte doit porter son intention.");
  }
  return { id: order.id, intent: order.paymentIntentId };
}

/** Un autre particulier : ses commandes ne remplacent pas celles de l'acheteur. */
async function otherBuyer(tag: string): Promise<string> {
  const user = await createUser(ctx.prisma, { auth0Sub: `auth0|non-reglee-${tag}` });
  return user.id;
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

    // La seconde passation a publié son fait, qui a remplacé la première.
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
    const young = await seedPending(await otherBuyer("jeune"), 29);
    const paid = await seedPending(await otherBuyer("payee"), 45);
    await ctx.app.get(CommandBus).execute(new ConfirmOrderPaymentCommand(paid.intent, "succeeded"));
    await ctx.drain();

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

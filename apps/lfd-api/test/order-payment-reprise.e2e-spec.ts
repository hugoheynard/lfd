/**
 * E2E de la **reprise d'un règlement refusé** (plan
 * `documentation/commandes/reglement/architecture-abandon-du-reglement.md`, lot 3 bis) : après un
 * refus de carte, la page de règlement sert encore la MÊME intention tant
 * qu'elle est vivante chez Stripe, et un encaissement qui suit solde la
 * commande (`settle` accepte `failed → paid` depuis 3b8598fdf).
 *
 * Seule frontière doublée : la passerelle de paiement. Son `retrieveIntent`
 * rend l'état que la suite lui fixe, comme Stripe après un refus
 * (`requires_payment_method`, donc `awaiting_payment`).
 *
 * Les commandes sont passées par le vrai chemin (`placeOrder`, plan T).
 */
import type { OrderPaymentIntent } from "@lfd/contracts";
import { CommandBus } from "@nestjs/cqrs";

import { ConfirmOrderPaymentCommand } from "../src/b2b/orders/application/commands/confirm-order-payment.command.js";
import {
  PaymentGateway,
  type PaymentIntentState,
} from "../src/b2b/payments/domain/payment-gateway.js";
import { PaymentStatus } from "../src/platform/database/client/client.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { pickupSite, placeOrder } from "./order-factory.js";

const BUYER = "auth0|reprise";

/** L'état que Stripe rendrait pour l'intention, fixé par chaque test. */
let intentState: PaymentIntentState = "awaiting_payment";

/** L'intention que la prochaine passation recevra, fixée par chaque test. */
let nextIntent = "pi_e2e";

const fakeGateway = {
  createIntent: () =>
    Promise.resolve({ paymentIntentId: nextIntent, clientSecret: `${nextIntent}_secret` }),
  retrieveIntent: (paymentIntentId: string) =>
    Promise.resolve({
      paymentIntentId,
      clientSecret: `${paymentIntentId}_secret`,
      state: intentState,
    }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [{ token: PaymentGateway, value: fakeGateway }] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  intentState = "awaiting_payment";
});

/** Une commande personnelle, carte en attente sur l'intention `intent`. */
async function seedPendingOrder(intent: string): Promise<string> {
  const buyer = await createUser(ctx.prisma, { auth0Sub: BUYER, firstName: "Léa" });
  nextIntent = intent;
  const order = await placeOrder(ctx, {
    buyerUserId: buyer.id,
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
  });
  return order.id;
}

async function webhook(intent: string, outcome: "succeeded" | "failed"): Promise<void> {
  await ctx.app.get(CommandBus).execute(new ConfirmOrderPaymentCommand(intent, outcome));
  await ctx.drain();
}

async function paymentStatusOf(orderId: string): Promise<PaymentStatus> {
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { paymentStatus: true },
  });
  return row.paymentStatus;
}

describe("GET /orders/:id/payment après un refus de carte", () => {
  it("sert la même intention, puis un encaissement solde la commande", async () => {
    const orderId = await seedPendingOrder("pi_reprise");

    await webhook("pi_reprise", "failed");
    expect(await paymentStatusOf(orderId)).toBe(PaymentStatus.failed);

    const { totalCents } = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { totalCents: true },
    });
    const response = await ctx.asSub(BUYER).get(`/orders/${orderId}/payment`).expect(200);
    expect(jsonBody<OrderPaymentIntent>(response)).toEqual({
      clientSecret: "pi_reprise_secret",
      publishableKey: "pk_e2e",
      // Le total que la passation a tarifé, pas un chiffre recopié.
      amountCents: totalCents,
    });
    expect(totalCents).toBeGreaterThan(0);

    await webhook("pi_reprise", "succeeded");
    expect(await paymentStatusOf(orderId)).toBe(PaymentStatus.paid);
    await ctx.asSub(BUYER).get(`/orders/${orderId}/payment`).expect(409);
  });

  it("refuse la page quand l'intention a été annulée chez Stripe", async () => {
    const orderId = await seedPendingOrder("pi_morte");
    await webhook("pi_morte", "failed");
    intentState = "canceled";

    await ctx.asSub(BUYER).get(`/orders/${orderId}/payment`).expect(409);
  });
});

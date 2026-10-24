/**
 * E2E du **second essai de carte** : un refus n'est pas la fin d'un règlement.
 *
 * Chez Stripe, un refus émet `payment_intent.payment_failed` et rend
 * l'intention à `requires_payment_method` : le client peut, sur la même page,
 * saisir une autre carte. Si elle passe, `payment_intent.succeeded` suit sur la
 * MÊME intention. Seuls le vrai SQL et le vrai bus prouvent que la commande
 * suit.
 *
 * Les commandes sont passées par le vrai chemin (`placeOrder`, plan T) ; seule
 * la passerelle de carte est doublée, et elle rend l'intention que le test
 * nomme. Le règlement passe par la vraie commande du commerce.
 */
import { CommandBus } from "@nestjs/cqrs";

import { ConfirmOrderPaymentCommand } from "../src/b2b/orders/application/commands/confirm-order-payment.command.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { PaymentStatus } from "../src/platform/database/client/client.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { pickupSite, placeOrder } from "./order-factory.js";

/** L'intention que la prochaine passation recevra, fixée par chaque test. */
let nextIntent = "pi_e2e";

/** Passerelle de carte doublée : elle rend l'intention nommée, aucun appel réseau. */
const fakeGateway = {
  createIntent: () =>
    Promise.resolve({ paymentIntentId: nextIntent, clientSecret: `${nextIntent}_secret` }),
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
});

/** Une commande personnelle, carte en attente sur l'intention `intent`. */
async function seedPendingOrder(intent: string): Promise<string> {
  const buyer = await createUser(ctx.prisma, { auth0Sub: "auth0|second-essai", firstName: "Léa" });
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

async function paymentOf(
  orderId: string,
): Promise<{ paymentStatus: PaymentStatus; paid: boolean }> {
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { paymentStatus: true, paidAt: true },
  });
  return { paymentStatus: row.paymentStatus, paid: row.paidAt !== null };
}

describe("un refus de carte, puis une autre carte qui passe", () => {
  /**
   * Régression : `settle` ne basculait que depuis `pending`. Après un refus, la
   * commande était `failed` ; le second essai réussi chez Stripe ne la trouvait
   * plus, et le client était DÉBITÉ d'une commande restée « refusée », exclue du
   * plan de production, sans que rien ne le dise (constaté le 2026-09-26).
   */
  it("la commande passe payée : l'encaissement réel l'emporte sur le refus précédent", async () => {
    const orderId = await seedPendingOrder("pi_second_essai");

    await webhook("pi_second_essai", "failed");
    expect(await paymentOf(orderId)).toEqual({ paymentStatus: PaymentStatus.failed, paid: false });

    await webhook("pi_second_essai", "succeeded");
    expect(await paymentOf(orderId)).toEqual({ paymentStatus: PaymentStatus.paid, paid: true });
  });

  it("un refus arrivé APRÈS l'encaissement ne rétrograde jamais une commande payée", async () => {
    const orderId = await seedPendingOrder("pi_refus_tardif");

    await webhook("pi_refus_tardif", "succeeded");
    await webhook("pi_refus_tardif", "failed");

    expect(await paymentOf(orderId)).toEqual({ paymentStatus: PaymentStatus.paid, paid: true });
  });

  it("un encaissement rejoué ne publie ni n'écrit rien de plus", async () => {
    const orderId = await seedPendingOrder("pi_rejoue");

    await webhook("pi_rejoue", "succeeded");
    const first = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { paidAt: true },
    });
    await webhook("pi_rejoue", "succeeded");
    const second = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { paidAt: true },
    });

    expect(second.paidAt).toEqual(first.paidAt);
  });
});

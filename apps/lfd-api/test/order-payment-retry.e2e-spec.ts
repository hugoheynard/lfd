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
 * le prestataire de carte est doublé, et il rend l'intention que le test
 * nomme. Le règlement passe par le vrai webhook de `card-payment`.
 */
import { CommandBus } from "@nestjs/cqrs";

import { RecordProviderEventCommand } from "../src/card-payment/application/commands/record-provider-event.command.js";
import type { CreatedIntent } from "../src/card-payment/domain/ports/card-provider-types.js";
import { CardProviders } from "../src/card-payment/domain/ports/card-providers.js";
import { assertOutsideTransaction } from "../src/platform/database/outside-transaction.js";
import { PaymentStatus } from "../src/platform/database/client/client.js";
import {
  cardFailed,
  cardPaid,
  E2E_CARD_ACCOUNT,
  E2eCardProvider,
  E2eCardProviders,
  e2eCardProviders,
} from "./card-payments.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { pickupSite, placeOrder } from "./order-factory.js";

/** L'intention que la prochaine passation recevra, fixée par chaque test. */
let nextIntent = "pi_e2e";

/** Le prestataire de carte doublé, qui rend l'intention nommée — aucun appel réseau. */
class NamedIntentCardProvider extends E2eCardProvider {
  override createIntent(): Promise<CreatedIntent> {
    assertOutsideTransaction("e2e.CardProvider.createIntent");
    this.issued.push(nextIntent);
    return Promise.resolve({ providerRef: nextIntent, clientSecret: `${nextIntent}_secret` });
  }
}

/** Le registre doublé, servi par le prestataire aux intentions nommées. */
class NamedIntentCardProviders extends E2eCardProviders {
  override readonly provider = new NamedIntentCardProvider("pi_e2e");
}

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: CardProviders, value: new NamedIntentCardProviders("pi_e2e") }],
  });
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

/** L'issue livrée par le webhook de `card-payment`, puis drainée. */
async function webhook(intent: string, outcome: "succeeded" | "failed"): Promise<void> {
  await (outcome === "succeeded" ? cardPaid : cardFailed)(ctx, intent);
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

describe("un webhook livré deux fois EN MÊME TEMPS", () => {
  /**
   * L'issue livrée par le webhook de `card-payment` SANS drainer : deux
   * livraisons doivent pouvoir se croiser dans la commande elle-même.
   */
  const outcomeNow = async (intent: string, outcome: "succeeded" | "failed"): Promise<void> => {
    const { provider } = e2eCardProviders(ctx);
    const eventId = provider.nextEventId();
    const { rawBody, signature } = provider.sign(
      outcome === "succeeded"
        ? { kind: "paid", eventId, eventType: "payment_intent.succeeded", providerRef: intent }
        : {
            kind: "payment_failed",
            eventId,
            eventType: "payment_intent.payment_failed",
            providerRef: intent,
          },
    );
    await ctx.app
      .get(CommandBus)
      .execute(new RecordProviderEventCommand(E2E_CARD_ACCOUNT, rawBody, signature));
  };

  /**
   * Stripe réémet jusqu'au 2xx : deux livraisons peuvent se croiser. La garde
   * est le `where` de `settle` ; si elle fuyait, `order.paid` partirait deux
   * fois (deux accusés, deux crédits de points) ou `paidAt` serait réécrit.
   */
  it("`succeeded` ×2 : un seul `order.paid`, une seule date d'encaissement", async () => {
    const orderId = await seedPendingOrder("pi_double_succes");

    await Promise.all([
      outcomeNow("pi_double_succes", "succeeded"),
      outcomeNow("pi_double_succes", "succeeded"),
    ]);

    expect(await ctx.prisma.outboxMessage.count({ where: { type: "order.paid" } })).toBe(1);
    expect(await paymentOf(orderId)).toEqual({ paymentStatus: PaymentStatus.paid, paid: true });
    await ctx.drain();
  });

  it("`failed` ×2 : un seul `order.payment_failed`", async () => {
    await seedPendingOrder("pi_double_refus");

    await Promise.all([
      outcomeNow("pi_double_refus", "failed"),
      outcomeNow("pi_double_refus", "failed"),
    ]);

    expect(await ctx.prisma.outboxMessage.count({ where: { type: "order.payment_failed" } })).toBe(
      1,
    );
    await ctx.drain();
  });

  /**
   * Dans le désordre, au même instant : quel que soit le gagnant du verrou de
   * ligne, un encaissement réel l'emporte — jamais une commande débitée que la
   * base croit refusée.
   */
  it("`succeeded` × `failed` : la commande finit payée, dans les deux ordres possibles", async () => {
    const orderId = await seedPendingOrder("pi_croises");

    await Promise.all([outcomeNow("pi_croises", "failed"), outcomeNow("pi_croises", "succeeded")]);

    expect(await paymentOf(orderId)).toEqual({ paymentStatus: PaymentStatus.paid, paid: true });
    await ctx.drain();
  });
});

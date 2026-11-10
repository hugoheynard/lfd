/**
 * E2E des **remboursements Stripe constatés** (lot R1 du plan
 * `documentation/comptabilite/facturation/facture-carte-et-remboursements.md`).
 *
 * Ce que seul le vrai SQL prouve :
 * - le carnet `card_payment.refund` (depuis le lot P1.b du plan M2 ; avant,
 *   `order_refund`), son unicité par `(compte, re_…)` et sa contrainte de
 *   montant ; le verrou de la commande sous lequel le cumul se lit ;
 * - la bascule `paid` → `refunded` écrite en base, et le journal dans la même
 *   transaction ;
 * - un refus qui n'écrit rien sur la commande mais se lit au journal et à la
 *   cloche ; un remboursement hors commande qui sonne aussi.
 *
 * Frontière doublée : le prestataire de carte de `card-payment` — le webhook
 * passe par la vraie route et le vrai contrôleur, mais la vérification de
 * signature est celle du double (la vraie est éprouvée par
 * `stripe-card-provider.spec.ts`). La commande est passée par le vrai chemin
 * (`placeOrder`, plan T) et réglée par le vrai webhook.
 */
import type {
  CardRefundStatus,
  CreatedIntent,
} from "../src/card-payment/domain/ports/card-provider-types.js";
import { CardProviders } from "../src/card-payment/domain/ports/card-providers.js";
import { assertOutsideTransaction } from "../src/platform/database/outside-transaction.js";
import { PaymentStatus } from "../src/platform/database/client/client.js";
import { cardPaid, E2eCardProvider, E2eCardProviders } from "./card-payments.js";
import { bootstrapE2e, daysAgo, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { pickupSite, placeOrder } from "./order-factory.js";

/** L'intention que la prochaine passation recevra. */
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

const cards = new NamedIntentCardProviders("pi_e2e");

/** Le total que la passation a tarifé — relu à chaque semis, jamais recopié. */
let orderTotal = 0;
/** L'instant Stripe du remboursement : recopié, jamais comparé à l'horloge. */
const REFUNDED_AT = new Date(daysAgo(1));

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [{ token: CardProviders, value: cards }] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

async function seedPaidOrder(intent: string): Promise<string> {
  const buyer = await createUser(ctx.prisma, { auth0Sub: "auth0|rembourse", firstName: "Léa" });
  nextIntent = intent;
  const order = await placeOrder(ctx, {
    buyerUserId: buyer.id,
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    // Dix croissants : le total dépasse le premier remboursement partiel (10 €).
    lines: [{ sku: "VIE-001-1", quantity: 10 }],
  });
  await cardPaid(ctx, intent);
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    select: { totalCents: true },
  });
  orderTotal = row.totalCents;
  return order.id;
}

interface Refund {
  readonly id: string;
  readonly intent: string;
  readonly amountCents: number;
  readonly status?: CardRefundStatus;
  readonly currency?: string;
}

/** Le remboursement, signé par le prestataire doublé et livré à la vraie route du webhook. */
async function webhook(refund: Refund): Promise<void> {
  const { signature } = cards.provider.sign({
    kind: "refund",
    eventId: cards.provider.nextEventId(),
    eventType: "refund.created",
    refundId: refund.id,
    providerRef: refund.intent,
    amountCents: refund.amountCents,
    currency: refund.currency ?? "eur",
    status: refund.status ?? "succeeded",
    createdAt: REFUNDED_AT,
  });
  await ctx
    .http()
    .post("/payments/webhook")
    .set("stripe-signature", signature)
    .set("content-type", "application/json")
    .send("{}")
    .expect(200);
  await ctx.drain();
}

/**
 * Le paiement carte de la commande — le carnet vit sous lui depuis le lot P1.b
 * du plan M2 (le webhook constate dans `card_payment.refund`, plus dans
 * `public.order_refund`, qui reste sans écrivain jusqu'à P2).
 */
async function paymentOf(orderId: string): Promise<string> {
  const payment = await ctx.prisma.cardPayment.findFirstOrThrow({
    where: { subjectType: "order", subjectId: orderId },
    select: { id: true },
  });
  return payment.id;
}

async function paymentStatusOf(orderId: string): Promise<PaymentStatus> {
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { paymentStatus: true },
  });
  return row.paymentStatus;
}

async function journalTypes(): Promise<string[]> {
  const rows = await ctx.prisma.activityEvent.findMany({
    where: { type: { startsWith: "order.refund" } },
    orderBy: { occurredAt: "asc" },
    select: { type: true },
  });
  return rows.map((row) => row.type);
}

describe("un remboursement partiel, puis le reste", () => {
  it("note chaque remboursement, garde `paid` au partiel, passe `refunded` au total", async () => {
    const orderId = await seedPaidOrder("pi_rembourse");

    await webhook({ id: "re_partiel", intent: "pi_rembourse", amountCents: 1_000 });
    expect(await paymentStatusOf(orderId)).toBe(PaymentStatus.paid);

    await webhook({ id: "re_reste", intent: "pi_rembourse", amountCents: orderTotal - 1_000 });

    expect(await paymentStatusOf(orderId)).toBe(PaymentStatus.refunded);
    const refunds = await ctx.prisma.cardRefund.findMany({
      where: { paymentId: await paymentOf(orderId) },
      orderBy: { amountCents: "asc" },
      select: { providerRef: true, amountCents: true, status: true, refundedAt: true },
    });
    expect(refunds).toEqual([
      {
        providerRef: "re_partiel",
        amountCents: 1_000,
        status: "succeeded",
        refundedAt: REFUNDED_AT,
      },
      {
        providerRef: "re_reste",
        amountCents: orderTotal - 1_000,
        status: "succeeded",
        refundedAt: REFUNDED_AT,
      },
    ]);
    expect(
      await ctx.prisma.activityEvent.count({
        where: { type: "order.fully_refunded", subjectId: orderId },
      }),
    ).toBe(1);
  });

  it("un webhook rejoué ne double ni la ligne ni le fait", async () => {
    const orderId = await seedPaidOrder("pi_rejoue");

    await webhook({ id: "re_rejoue", intent: "pi_rejoue", amountCents: 500 });
    await webhook({ id: "re_rejoue", intent: "pi_rejoue", amountCents: 500 });

    expect(
      await ctx.prisma.cardRefund.count({ where: { paymentId: await paymentOf(orderId) } }),
    ).toBe(1);
    expect(await journalTypes()).toEqual(["order.refund_recorded"]);
  });
});

describe("ce qui est refusé, et se voit", () => {
  it("une devise étrangère : rien d'écrit sur la commande, le journal et la cloche le disent", async () => {
    const orderId = await seedPaidOrder("pi_dollar");

    await webhook({ id: "re_dollar", intent: "pi_dollar", amountCents: 500, currency: "usd" });

    expect(
      await ctx.prisma.cardRefund.count({ where: { paymentId: await paymentOf(orderId) } }),
    ).toBe(0);
    expect(await paymentStatusOf(orderId)).toBe(PaymentStatus.paid);
    expect(await journalTypes()).toEqual(["order.refund_rejected"]);
    expect(
      await ctx.prisma.staffNotification.count({ where: { kind: "order.refund_rejected" } }),
    ).toBe(1);
  });

  it("un remboursement d'un paiement qu'aucune commande ne porte : noté, et la cloche sonne", async () => {
    await webhook({ id: "re_lien_libre", intent: "pi_lien_libre", amountCents: 4_000 });

    expect(await ctx.prisma.cardRefund.count()).toBe(0);
    expect(
      await ctx.prisma.activityEvent.count({
        where: { type: "payment_refund.unmatched", subjectId: "re_lien_libre" },
      }),
    ).toBe(1);
    expect(
      await ctx.prisma.staffNotification.count({ where: { kind: "payment_refund.unmatched" } }),
    ).toBe(1);
  });
});

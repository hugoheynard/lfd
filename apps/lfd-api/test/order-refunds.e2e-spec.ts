/**
 * E2E des **remboursements Stripe constatés** (lot R1 du plan
 * `documentation/comptabilite/facturation/plan-facture-carte-et-remboursements.md`).
 *
 * Ce que seul le vrai SQL prouve :
 * - la table `order_refund`, son unicité par `stripe_refund_id` et sa
 *   contrainte de montant ; le verrou de la commande sous lequel le cumul se lit ;
 * - la bascule `paid` → `refunded` écrite en base, et le journal dans la même
 *   transaction ;
 * - un refus qui n'écrit rien sur la commande mais se lit au journal et à la
 *   cloche ; un remboursement hors commande qui sonne aussi.
 *
 * Frontière doublée : la passerelle Stripe — le webhook passe par la vraie
 * route et le vrai contrôleur, mais la vérification de signature est celle du
 * double (la vraie est éprouvée par `stripe-payment-gateway-refunds.spec.ts`).
 * La commande est semée par Prisma, faute d'agrégat qui sache écrire une
 * commande à un état donné (même dette que `test/factories.ts`).
 */
import {
  PaymentGateway,
  type PaymentRefundStatus,
  type PaymentWebhookEvent,
} from "../src/b2b/payments/domain/payment-gateway.js";
import {
  OrderClientele,
  OrderStatus,
  PaymentStatus,
} from "../src/platform/database/client/client.js";
import { bootstrapE2e, daysAgo, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";

/** Le prochain événement que « Stripe » livrera au webhook. */
let nextWebhook: PaymentWebhookEvent = { kind: "ignored" };
const fakeGateway = {
  createIntent: () => Promise.reject(new Error("aucune intention dans cette suite")),
  retrieveIntent: () => Promise.reject(new Error("aucune intention dans cette suite")),
  publishableKey: () => "pk_e2e",
  parseWebhook: (): PaymentWebhookEvent => nextWebhook,
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

const TOTAL = 2_110;
/** L'instant Stripe du remboursement : recopié, jamais comparé à l'horloge. */
const REFUNDED_AT = new Date(daysAgo(1));

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [{ token: PaymentGateway, value: fakeGateway }] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  nextWebhook = { kind: "ignored" };
});

async function seedPaidOrder(intent: string): Promise<string> {
  const buyer = await createUser(ctx.prisma, { auth0Sub: "auth0|rembourse", firstName: "Léa" });
  const order = await ctx.prisma.order.create({
    data: {
      orderNumber: "CMD-REMB-1",
      placedByUserId: buyer.id,
      clientele: OrderClientele.public,
      status: OrderStatus.placed,
      subtotalCents: 2_000,
      totalCents: TOTAL,
      vatCents: 110,
      paymentStatus: PaymentStatus.paid,
      stripePaymentIntentId: intent,
    },
    select: { id: true },
  });
  return order.id;
}

interface Refund {
  readonly id: string;
  readonly intent: string;
  readonly amountCents: number;
  readonly status?: PaymentRefundStatus;
  readonly currency?: string;
}

async function webhook(refund: Refund): Promise<void> {
  nextWebhook = {
    kind: "refund",
    refundId: refund.id,
    paymentIntentId: refund.intent,
    amountCents: refund.amountCents,
    currency: refund.currency ?? "eur",
    status: refund.status ?? "succeeded",
    createdAt: REFUNDED_AT,
  };
  await ctx
    .http()
    .post("/payments/webhook")
    .set("stripe-signature", "t=1,v1=signé-par-le-doublé")
    .set("content-type", "application/json")
    .send("{}")
    .expect(200);
  await ctx.drain();
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

    await webhook({ id: "re_reste", intent: "pi_rembourse", amountCents: TOTAL - 1_000 });

    expect(await paymentStatusOf(orderId)).toBe(PaymentStatus.refunded);
    const refunds = await ctx.prisma.orderRefund.findMany({
      where: { orderId },
      orderBy: { amountCents: "asc" },
      select: { stripeRefundId: true, amountCents: true, status: true, refundedAt: true },
    });
    expect(refunds).toEqual([
      {
        stripeRefundId: "re_partiel",
        amountCents: 1_000,
        status: "succeeded",
        refundedAt: REFUNDED_AT,
      },
      {
        stripeRefundId: "re_reste",
        amountCents: TOTAL - 1_000,
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

    expect(await ctx.prisma.orderRefund.count({ where: { orderId } })).toBe(1);
    expect(await journalTypes()).toEqual(["order.refund_recorded"]);
  });
});

describe("ce qui est refusé, et se voit", () => {
  it("une devise étrangère : rien d'écrit sur la commande, le journal et la cloche le disent", async () => {
    const orderId = await seedPaidOrder("pi_dollar");

    await webhook({ id: "re_dollar", intent: "pi_dollar", amountCents: 500, currency: "usd" });

    expect(await ctx.prisma.orderRefund.count({ where: { orderId } })).toBe(0);
    expect(await paymentStatusOf(orderId)).toBe(PaymentStatus.paid);
    expect(await journalTypes()).toEqual(["order.refund_rejected"]);
    expect(
      await ctx.prisma.staffNotification.count({ where: { kind: "order.refund_rejected" } }),
    ).toBe(1);
  });

  it("un remboursement d'un paiement qu'aucune commande ne porte : noté, et la cloche sonne", async () => {
    await webhook({ id: "re_lien_libre", intent: "pi_lien_libre", amountCents: 4_000 });

    expect(await ctx.prisma.orderRefund.count()).toBe(0);
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

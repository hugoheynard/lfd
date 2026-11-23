/**
 * E2E de **l'argent rendu, par lot** — `SucceededCardRefundsReader`, déclaré
 * et implémenté par `payment` dans son canal (lot E0 de
 * `documentation/commandes/export/plan-export-des-ventes.md`, § 5).
 *
 * Ce que seul le vrai SQL prouve : la lecture traverse le carnet et ses
 * paiements dans le schéma `payment`, ne rend que le réussi — comme la
 * position du sujet le compte —, et range chaque remboursement à son sujet.
 * Le remboursement suit le vrai parcours : la demande par sujet, l'exécuteur
 * après validation, puis le webhook du prestataire doublé.
 */
import { CardRefunds, SucceededCardRefundsReader } from "../src/payment/channels/requests/index.js";
import { CardProviders } from "../src/payment/card/domain/ports/card-providers.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { cardProvidersDouble, recordCardEvent, settleCardPayments } from "./card-payments.js";
import { bootstrapE2e, daysAgo, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { pickupSite, placeOrder } from "./order-factory.js";

/** L'instant du prestataire : recopié, jamais comparé à l'horloge. */
const REFUNDED_AT = new Date(daysAgo(1));

const cards = cardProvidersDouble("pi_export_refund");
let ctx: E2eContext;
let seq = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [{ token: CardProviders, value: cards }] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  cards.provider.refundIssuances.splice(0);
  cards.provider.refundCalls.splice(0);
});

/** Une commande de retrait d'un particulier, payée par le vrai webhook. */
async function paidOrder(): Promise<{ readonly id: string; readonly totalCents: number }> {
  seq += 1;
  const buyer = await createUser(ctx.prisma, { auth0Sub: `auth0|export-rendu-${String(seq)}` });
  const order = await placeOrder(ctx, {
    buyerUserId: buyer.id,
    settlement: "card",
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
  });
  await settleCardPayments(ctx, cards.provider.issued);
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    select: { totalCents: true },
  });
  return { id: order.id, totalCents: row.totalCents };
}

/** Rend tout le reste (`return`), émis tout de suite, puis constaté réussi. */
async function refundedInFull(order: { readonly id: string; readonly totalCents: number }) {
  cards.provider.refundIssuances.push({
    kind: "issued",
    refund: {
      refundId: `re_export_${order.id}`,
      amountCents: order.totalCents,
      currency: "eur",
      status: "pending",
      createdAt: REFUNDED_AT,
    },
  });
  await ctx.app
    .get(UnitOfWork)
    .run(() =>
      ctx.app
        .get(CardRefunds)
        .requestRemainder(
          { subject: { type: "order", id: order.id } },
          { nature: "return", reason: "cancellation", schedule: "now", requestedBy: null },
        ),
    );
  await ctx.drain();
  const payment = await ctx.prisma.cardPayment.findFirstOrThrow({
    where: { subjectType: "order", subjectId: order.id },
  });
  const request = await ctx.prisma.cardRefundRequest.findFirstOrThrow({
    where: { paymentId: payment.id },
  });
  await recordCardEvent(ctx, (eventId) => ({
    kind: "refund",
    eventId,
    eventType: "refund.updated",
    providerRef: payment.providerRef ?? "",
    refundId: `re_export_${order.id}`,
    amountCents: order.totalCents,
    currency: "eur",
    status: "succeeded",
    createdAt: REFUNDED_AT,
    ours: { requestId: request.id, generation: 1 },
  }));
  return payment.providerRef ?? "";
}

describe("SucceededCardRefundsReader — l'argent rendu de sujets, par lot", () => {
  it("rend le remboursement réussi de chaque commande, et rien d'une commande sans remboursement", async () => {
    const refunded = await paidOrder();
    const untouched = await paidOrder();
    await refundedInFull(refunded);

    const refunds = await ctx.app
      .get(SucceededCardRefundsReader)
      .succeededOf("order", [refunded.id, untouched.id]);

    expect(refunds).toEqual([
      {
        subjectId: refunded.id,
        refundedAt: REFUNDED_AT,
        amountCents: refunded.totalCents,
        nature: "return",
      },
    ]);
  });

  it("ne rend pas un remboursement encore en attente de la banque", async () => {
    const order = await paidOrder();
    const providerRef = await refundedInFull(order);
    // Un second `re_…`, fait hors de la plateforme, encore en attente.
    await recordCardEvent(ctx, (eventId) => ({
      kind: "refund",
      eventId,
      eventType: "refund.created",
      providerRef,
      refundId: "re_export_en_attente",
      amountCents: 1,
      currency: "eur",
      status: "pending",
      createdAt: REFUNDED_AT,
    }));
    const pending = await ctx.prisma.cardRefund.count({ where: { status: "pending" } });

    const refunds = await ctx.app.get(SucceededCardRefundsReader).succeededOf("order", [order.id]);

    expect(pending).toBe(1);
    expect(refunds.map((refund) => refund.amountCents)).toEqual([order.totalCents]);
  });

  it("un autre type de sujet, ou un lot vide, ne rend rien", async () => {
    const order = await paidOrder();
    await refundedInFull(order);
    const reader = ctx.app.get(SucceededCardRefundsReader);

    expect(await reader.succeededOf("invoice", [order.id])).toEqual([]);
    expect(await reader.succeededOf("order", [])).toEqual([]);
  });
});

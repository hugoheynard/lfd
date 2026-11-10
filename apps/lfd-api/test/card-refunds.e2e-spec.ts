/**
 * E2E du **remboursement par carte, dans le bloc `card-payment`** (plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * lot P1.b, §3.3 à §3.6, §6.3).
 *
 * Le parcours entier, contre le vrai Postgres : une commande payée par le vrai
 * webhook ; `CardRefunds.requestRemainder` par SUJET, dans une unité de
 * travail (comme l'annulation le fera en P1.c) ; l'exécuteur après validation,
 * qui trouve le prestataire muet ; le balayage, à l'échéance, qui émet ; puis
 * le webhook `refund.updated succeeded` constaté par le bloc lui-même — la
 * commande `refunded`, le carnet et la demande justes, les faits publiés.
 *
 * Ce que seul le vrai SQL prouve ici : les déclencheurs de la migration
 * `20261110010100_…` n'ont rien refusé de ce que le code a tenté (la machine,
 * les colonnes immuables, l'index d'une `remainder` en cours), et l'ordre des
 * verrous (`orders` puis `card_payment.payment`) tient dans une transaction.
 *
 * Frontière doublée : le prestataire, au jeton `CardProviders` ; et l'horloge
 * MURALE, pour faire échoir la reprise sans attendre.
 */
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { PaymentStatus } from "../src/platform/database/client/client.js";
import { WallClock } from "../src/platform/time/wall-clock.js";
import { CardRefunds } from "../src/card-payment/channels/requests/index.js";
import { CardProviders } from "../src/card-payment/domain/ports/card-providers.js";
import {
  cardProvidersDouble,
  E2E_CARD_ACCOUNT,
  recordCardEvent,
  settleCardPayments,
} from "./card-payments.js";
import { bootstrapE2e, daysAgo, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { pickupSite, placeOrder } from "./order-factory.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

/** L'heure du mur, réelle, plus un décalage qu'on avance. */
class OffsetWallClock extends WallClock {
  offsetMs = 0;

  elapsedNow(): Date {
    return new Date(Date.now() + this.offsetMs);
  }
}

/** Le délai le plus long de la courbe de reprise est bien en deçà d'un jour. */
const PAST_EVERY_RETRY_MS = 24 * 60 * 60 * 1000;
/** L'instant du prestataire : recopié, jamais comparé à l'horloge. */
const REFUNDED_AT = new Date(daysAgo(1));

const cards = cardProvidersDouble("pi_refund");
const wall = new OffsetWallClock();
let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: CardProviders, value: cards },
      { token: WallClock, value: wall },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  wall.offsetMs = 0;
  cards.provider.refundIssuances.splice(0);
  cards.provider.refundCalls.splice(0);
});

/** Une commande de retrait, payée par le vrai webhook. Rend son id et son total. */
async function paidOrder(): Promise<{ readonly id: string; readonly totalCents: number }> {
  const buyer = await createUser(ctx.prisma, { auth0Sub: "auth0|carte-rendue", firstName: "Léa" });
  const order = await placeOrder(ctx, {
    buyerUserId: buyer.id,
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    lines: [{ sku: "VIE-001-1", quantity: 3 }],
  });
  await settleCardPayments(ctx, cards.provider.issued);
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    select: { totalCents: true, paymentStatus: true },
  });
  expect(row.paymentStatus).toBe(PaymentStatus.paid);
  return { id: order.id, totalCents: row.totalCents };
}

async function requestOf(orderId: string) {
  const payment = await ctx.prisma.cardPayment.findFirstOrThrow({
    where: { subjectType: "order", subjectId: orderId },
  });
  const request = await ctx.prisma.cardRefundRequest.findFirstOrThrow({
    where: { paymentId: payment.id },
  });
  return { payment, request };
}

async function journal(prefix: string): Promise<string[]> {
  const rows = await ctx.prisma.activityEvent.findMany({
    where: { type: { startsWith: prefix } },
    orderBy: { occurredAt: "asc" },
    select: { type: true },
  });
  return rows.map((row) => row.type);
}

describe("le remboursement par carte, de la demande au constat", () => {
  it("demande par sujet → prestataire muet → balayage à l'échéance → webhook réussi : la commande est `refunded`", async () => {
    const order = await paidOrder();

    // 1. La demande, par SUJET, dans la transaction de l'appelant ; l'exécuteur
    //    part après validation et trouve le prestataire muet (file vide).
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

    const first = await requestOf(order.id);
    expect(first.request).toMatchObject({
      form: "remainder",
      nature: "return",
      state: "to_issue",
      announcedCents: order.totalCents,
      attempts: 1,
      round: 2,
      lastFailure: "unavailable",
      claimToken: null,
    });
    expect(cards.provider.refundCalls.map((call) => call.key)).toEqual([
      `lfd-card-refund:${first.request.id}:1:1`,
    ]);
    expect(cards.provider.refundCalls[0]?.params).toMatchObject({
      subjectLabel: `order:${order.id}`,
      amountCents: null,
    });

    // 2. Avant l'échéance, le balayage ne prend rien.
    const early = await ctx
      .http()
      .post("/admin/card-payments/sweep")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);
    expect(early.body).toEqual({ taken: 0 });

    // 3. À l'échéance, il émet : le prestataire rend un `re_…` en attente.
    cards.provider.refundIssuances.push({
      kind: "issued",
      refund: {
        refundId: "re_e2e_rendu",
        amountCents: order.totalCents,
        currency: "eur",
        status: "pending",
        createdAt: REFUNDED_AT,
      },
    });
    wall.offsetMs = PAST_EVERY_RETRY_MS;
    const swept = await ctx
      .http()
      .post("/admin/card-payments/sweep")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);
    expect(swept.body).toEqual({ taken: 1 });
    await ctx.drain();

    const issued = await requestOf(order.id);
    expect(issued.request).toMatchObject({
      state: "issued",
      providerRef: "re_e2e_rendu",
      attempts: 2,
      issuedCents: order.totalCents,
    });
    expect(cards.provider.refundCalls.map((call) => call.key)).toEqual([
      `lfd-card-refund:${first.request.id}:1:1`,
      `lfd-card-refund:${first.request.id}:1:2`,
    ]);

    // 4. Le webhook : le remboursement a réussi, retrouvé par sa métadonnée.
    await recordCardEvent(ctx, (eventId) => ({
      kind: "refund",
      eventId,
      eventType: "refund.updated",
      providerRef: issued.payment.providerRef ?? "",
      refundId: "re_e2e_rendu",
      amountCents: order.totalCents,
      currency: "eur",
      status: "succeeded",
      createdAt: REFUNDED_AT,
      ours: { requestId: first.request.id, generation: 1 },
    }));

    const done = await requestOf(order.id);
    expect(done.request.state).toBe("refunded");
    const carnet = await ctx.prisma.cardRefund.findMany({ where: { paymentId: done.payment.id } });
    expect(carnet).toMatchObject([
      {
        account: E2E_CARD_ACCOUNT,
        source: "provider",
        providerRef: "re_e2e_rendu",
        requestId: first.request.id,
        nature: "return",
        amountCents: order.totalCents,
        status: "succeeded",
      },
    ]);
    const after = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { paymentStatus: true },
    });
    expect(after.paymentStatus).toBe(PaymentStatus.refunded);

    // Les faits : ceux du bloc, et ceux de la commande, publiés par elle au canal.
    const facts = await ctx.prisma.outboxMessage.findMany({
      where: {
        type: {
          in: [
            "card_payment.refund_succeeded",
            "card_payment.fully_refunded",
            "order.refund_succeeded",
          ],
        },
      },
      select: { type: true },
    });
    expect(facts.map((fact) => fact.type).sort()).toEqual([
      "card_payment.fully_refunded",
      "card_payment.refund_succeeded",
      "order.refund_succeeded",
    ]);
    expect(await journal("card_payment.")).toEqual([
      "card_payment.attempt_failed",
      "card_payment.issued",
    ]);
    expect([...(await journal("order.refund")), ...(await journal("order.fully"))]).toEqual([
      "order.refund_attempt_failed",
      "order.refund_recorded",
      "order.refund_recorded",
      "order.fully_refunded",
    ]);
    // Aucun abonné n'a échoué sur ces faits : rien en lettre d'erreur.
    expect(await ctx.prisma.outboxDelivery.count({ where: { lastError: { not: null } } })).toBe(0);
    // Une cloche, au premier échec ; aucune quand tout va bien ensuite.
    const bells = await ctx.prisma.staffNotification.findMany({
      where: { kind: "card_payment.refund_attention" },
      select: { idempotencyKey: true },
    });
    expect(bells.map((bell) => bell.idempotencyKey)).toEqual([
      `notification:card_payment.refund_attention:${first.request.id}:1:unavailable`,
    ]);
    // Les anciennes tables d'`orders` ne sont plus écrites par ce chemin.
    expect(await ctx.prisma.orderRefund.count()).toBe(0);
    expect(await ctx.prisma.orderRefundRequest.count()).toBe(0);
  });

  it("le même webhook rejoué n'écrit rien de plus", async () => {
    const order = await paidOrder();
    const { payment } = await requestOfPayment(order.id);
    const refund = (eventId: string) =>
      ({
        kind: "refund",
        eventId,
        eventType: "refund.updated",
        providerRef: payment.providerRef ?? "",
        refundId: "re_e2e_tableau",
        amountCents: 500,
        currency: "eur",
        status: "succeeded",
        createdAt: REFUNDED_AT,
      }) as const;

    await recordCardEvent(ctx, refund);
    await recordCardEvent(ctx, refund);

    expect(await ctx.prisma.cardRefund.count({ where: { paymentId: payment.id } })).toBe(1);
    expect(
      await ctx.prisma.outboxMessage.count({ where: { type: "card_payment.refund_succeeded" } }),
    ).toBe(1);
  });
});

async function requestOfPayment(orderId: string) {
  const payment = await ctx.prisma.cardPayment.findFirstOrThrow({
    where: { subjectType: "order", subjectId: orderId },
  });
  return { payment };
}

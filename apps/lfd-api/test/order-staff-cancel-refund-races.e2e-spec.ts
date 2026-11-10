/**
 * E2E des **courses du remboursement à l'annulation** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, lot C4, C4.7, C4.12) :
 * double clic, deux exécuteurs, bail échu, `COMMIT` perdu, webhook avant et
 * après l'écriture de l'exécuteur, clôture, encaissé après annulation.
 *
 * La scène est partagée avec `order-staff-cancel-refund.e2e-spec.ts`. Mêmes
 * scénarios depuis le lot P1.c du plan M2 : l'exécuteur, son bail, le
 * balayage, « Relancer » et le constat sont ceux du bloc `card-payment`.
 */
import type request from "supertest";

import { OrderStatus, PaymentStatus } from "../src/platform/database/client/client.js";
import { cardPaid } from "./card-payments.js";
import { E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import {
  cancelledMails,
  cancelRequest,
  DAY,
  deliver,
  orderState,
  resetScene,
  gestureDuringRead,
} from "./order-staff-cancel-scene.js";
import { seedOrder } from "./order-staff-cancel-orders.js";
import {
  advanceWallPastRetries,
  attention,
  bootRefundScene,
  issueNow,
  ledgerOf,
  refundRequestOf,
  resetStripe,
  seedPaidOrder,
  stripe,
  sweepRefunds,
  wall,
  webhook,
} from "./order-staff-cancel-refund-scene.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootRefundScene();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await resetScene();
  resetStripe();
});

afterEach(() => {
  expect(stripe.underTransaction).toBe(0);
});

const codeOf = (response: request.Response) => jsonBody<{ readonly code: string }>(response).code;
const SIX_MINUTES = 6 * 60 * 1000;

/** Une payée annulée dont le premier appel n'a pas abouti : la demande attend. */
async function waitingRequest(): Promise<{
  readonly orderId: string;
  readonly requestId: string;
  readonly intent: string;
  readonly totalCents: number;
}> {
  const { orderId, intent, totalCents } = await seedPaidOrder();
  stripe.script.push({ kind: "unavailable" });
  await cancelRequest(orderId).expect(204);
  await deliver();
  const request = await refundRequestOf(orderId);
  if (request === null) {
    throw new Error("la demande attendue manque");
  }
  return { orderId, requestId: request.id, intent: intent ?? "", totalCents };
}

describe("un seul remboursement, quoi qu'il arrive", () => {
  it("double clic : une annulation, une demande, un remboursement, un courriel ; l'autre 409", async () => {
    const { orderId } = await seedPaidOrder();

    const responses = await Promise.all([cancelRequest(orderId), cancelRequest(orderId)]);
    await deliver();

    expect(responses.map((response) => response.status).sort()).toEqual([204, 409]);
    const refused = responses.find((response) => response.status === 409);
    expect(refused === undefined ? null : codeOf(refused)).toBe("orders.cancel.already_cancelled");
    expect(stripe.refunds).toHaveLength(1);
    expect(cancelledMails()).toHaveLength(1);
  });

  it("deux exécuteurs simultanés (balayage + bouton) : un seul prend le bail, un seul appel", async () => {
    const { requestId } = await waitingRequest();
    advanceWallPastRetries();
    const seen: { button: request.Response | null } = { button: null };
    stripe.during = async () => {
      const [, button] = await Promise.all([
        issueNow(requestId),
        ctx.asSub(E2E_STAFF_SUB).post(`/admin/card-payments/refund-requests/${requestId}/retry`),
      ]);
      seen.button = button;
    };

    await issueNow(requestId);
    await deliver();

    expect(stripe.calls).toHaveLength(2);
    expect(stripe.refunds).toHaveLength(1);
    expect(seen.button?.status).toBe(409);
    expect(seen.button === null ? null : codeOf(seen.button)).toBe(
      "card_payment.refund_request.retry_in_progress",
    );
  });

  it("un exécuteur mort tient le bail : rien avant son échéance, repris par le balayage après", async () => {
    const { orderId, requestId } = await waitingRequest();
    advanceWallPastRetries();
    await ctx.prisma.cardRefundRequest.update({
      where: { id: requestId },
      data: { claimToken: "mort", claimedUntil: new Date(wall.elapsedNow().getTime() + 60_000) },
    });

    await sweepRefunds().expect(200);
    expect(stripe.calls).toHaveLength(1);

    wall.offsetMs += SIX_MINUTES;
    await sweepRefunds().expect(200);
    expect(stripe.calls).toHaveLength(2);
    expect((await refundRequestOf(orderId))?.providerRef).toBe("re_e2e_1");
  });

  it("`COMMIT` perdu après un re_… créé : la recherche le retrouve, aucun second", async () => {
    const { orderId, requestId, intent, totalCents } = await waitingRequest();
    // Ce que Stripe sait et que la base a perdu : le re_… de la génération 1.
    stripe.refunds.push({
      refundId: "re_perdu",
      amountCents: totalCents,
      currency: "eur",
      status: "pending",
      createdAt: new Date(),
      paymentIntentId: intent,
      requestId,
      generation: 1,
      key: "une-clé-oubliée",
    });
    advanceWallPastRetries();

    await sweepRefunds().expect(200);

    expect(stripe.refunds).toHaveLength(1);
    expect((await refundRequestOf(orderId))?.providerRef).toBe("re_perdu");
    expect(await ledgerOf(orderId)).toEqual([
      { providerRef: "re_perdu", amountCents: totalCents, status: "pending" },
    ]);
  });
});

describe("le webhook et l'exécuteur se croisent", () => {
  it("`refund.created` livré AVANT l'écriture de l'exécuteur : une ligne, aucun refus", async () => {
    const { orderId, intent, totalCents } = await seedPaidOrder();
    stripe.afterIssue = (refund) => webhook(intent ?? "", refund, "pending");

    await cancelRequest(orderId).expect(204);
    await deliver();

    expect(await ledgerOf(orderId)).toEqual([
      { providerRef: "re_e2e_1", amountCents: totalCents, status: "pending" },
    ]);
    expect((await refundRequestOf(orderId))?.providerRef).toBe("re_e2e_1");
    expect(
      await ctx.prisma.staffNotification.count({ where: { kind: "order.refund_rejected" } }),
    ).toBe(0);
  });

  it("`refund.updated` réussi livré APRÈS : `refunded`, un seul `order.refund_succeeded`", async () => {
    const { orderId, intent } = await seedPaidOrder();
    await cancelRequest(orderId).expect(204);
    await deliver();

    const issued = stripe.refunds[0];
    if (issued === undefined) {
      throw new Error("aucun remboursement émis");
    }
    await webhook(intent ?? "", issued, "succeeded");
    await webhook(intent ?? "", issued, "succeeded");

    expect((await orderState(orderId)).paymentStatus).toBe(PaymentStatus.refunded);
    expect(
      await ctx.prisma.outboxMessage.count({ where: { type: "order.refund_succeeded" } }),
    ).toBe(1);
  });
});

describe("le carnet refuse le constat de l'exécuteur", () => {
  it("`exceeds_charge` au constat : la cloche du refus, plus de rejeu", async () => {
    const { orderId } = await seedPaidOrder();
    stripe.status = "succeeded";
    stripe.script.push({ kind: "issue_amount", amountCents: 9_999 });

    await cancelRequest(orderId).expect(204);
    await deliver();

    expect(await ledgerOf(orderId)).toEqual([]);
    expect(await refundRequestOf(orderId)).toMatchObject({
      lastFailure: "rejected:exceeds_charge",
      nextAttemptAt: null,
    });
    expect(
      await ctx.prisma.staffNotification.count({ where: { kind: "order.refund_rejected" } }),
    ).toBe(1);
  });
});

describe("la course avec la clôture (C3, sur une payée)", () => {
  const closeDay = () => ctx.asSub(E2E_STAFF_SUB).post(`/admin/production/batch/${DAY}/close`);
  const inscribed = () =>
    ctx.prisma.productionOrder.findMany({ where: { serviceDay: DAY }, select: { orderId: true } });

  /** Régression : la clôture lit sous son verrou (52561f210) ; l'annulation attend, puis est refusée. */
  it("annulée pendant la lecture de la clôture : refusée après l'arrêt, ni demande ni remboursement", async () => {
    const kept = await seedPaidOrder();
    const cancelled = await seedPaidOrder();
    const cancelling = gestureDuringRead(() => cancelRequest(cancelled.orderId));

    await closeDay().expect(201);
    const refused = await cancelling();
    await deliver();

    expect(refused.status).toBe(409);
    expect((await inscribed()).map((row) => row.orderId).sort()).toEqual(
      [kept.orderId, cancelled.orderId].sort(),
    );
    expect(await refundRequestOf(cancelled.orderId)).toBeNull();
    expect(stripe.calls).toEqual([]);
  });

  it("inscrite d'abord : refus « inscrite », ni demande ni remboursement — jamais les deux", async () => {
    const { orderId } = await seedPaidOrder();
    await closeDay().expect(201);
    await deliver();

    const response = await cancelRequest(orderId);

    expect(response.status).toBe(409);
    expect(await refundRequestOf(orderId)).toBeNull();
    expect(stripe.calls).toEqual([]);
  });
});

describe("l'encaissé après annulation se rembourse tout seul (C4.11)", () => {
  it("une carte annulée puis débitée : demande `paid_after_cancellation`, remboursée, sans cloche", async () => {
    const { orderId, intent, totalCents } = await seedOrder();
    await cancelRequest(orderId).expect(204);
    await deliver();
    stripe.charged.set(intent ?? "", totalCents);

    await cardPaid(ctx, intent ?? "");
    await deliver();

    expect((await orderState(orderId)).status).toBe(OrderStatus.cancelled);
    expect(await refundRequestOf(orderId)).toMatchObject({
      reason: "paid_after_cancellation",
      nature: "return",
      announcedCents: totalCents,
      requestedBy: null,
      providerRef: "re_e2e_1",
    });
    expect(await attention()).toEqual([]);
    expect(
      await ctx.prisma.staffNotification.count({
        where: { kind: "order.paid_after_cancellation" },
      }),
    ).toBe(0);
  });

  it("une PAYÉE annulée par C4 qui revoit `payment_intent.succeeded` : pas « encaissée après annulation »", async () => {
    const { orderId, intent } = await seedPaidOrder();
    await cancelRequest(orderId).expect(204);
    await deliver();

    await cardPaid(ctx, intent ?? "");
    await deliver();

    expect(
      await ctx.prisma.outboxMessage.count({ where: { type: "order.paid_after_cancellation" } }),
    ).toBe(0);
    expect(stripe.refunds).toHaveLength(1);
  });
});

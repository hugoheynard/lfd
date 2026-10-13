/**
 * E2E de **l'annulation d'une commande PAYÉE, avec remboursement** (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, lot C4) — le geste,
 * la demande persistée, l'exécuteur, le carnet, le courriel, le journal,
 * l'écran, « Relancer », le balayage et le droit.
 *
 * Les courses (deux exécuteurs, webhook avant/après, clôture, `COMMIT` perdu)
 * sont dans `order-staff-cancel-refund-races.e2e-spec.ts` ; « Relancer », le
 * balayage et le droit dans `order-staff-cancel-refund-sweep.e2e-spec.ts`.
 */
import type { AdminOrderView } from "@lfd/contracts";
import type request from "supertest";

import { OrderStatus, PaymentStatus } from "../src/platform/database/client/client.js";
import { daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import {
  cancelledMails,
  cancelRequest,
  deliver,
  orderState,
  resetScene,
  scene,
  seedOrder,
} from "./order-staff-cancel-scene.js";
import {
  advanceWallPastRetries,
  attention,
  bootRefundScene,
  ledgerOf,
  refundRequestOf,
  resetStripe,
  seedPaidOrder,
  stripe,
  sweepRefunds,
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
  // 🔴 Aucun appel à Stripe sous une transaction (C4.7).
  expect(stripe.underTransaction).toBe(0);
});

const codeOf = (response: request.Response) => jsonBody<{ readonly code: string }>(response).code;
const detail = async (orderId: string) =>
  jsonBody<AdminOrderView>(
    await ctx.asSub(E2E_STAFF_SUB).get(`/admin/orders/${orderId}`).expect(200),
  );
const retry = (orderId: string, sub = E2E_STAFF_SUB) =>
  ctx.asSub(sub).post(`/admin/orders/${orderId}/refund/retry`);

describe("une commande payée s'annule, et l'argent part après", () => {
  it("annulée, une demande, un re_… sans montant imposé, carnet `pending` ; le webhook la dit remboursée", async () => {
    const { orderId, intent } = await seedPaidOrder();

    const before = await detail(orderId);
    expect(before.cancellability).toMatchObject({
      cancellable: true,
      refund: { amountCents: 1_055 },
    });
    await cancelRequest(orderId).expect(204);
    await deliver();

    expect(await orderState(orderId)).toMatchObject({
      status: OrderStatus.cancelled,
      paymentStatus: PaymentStatus.paid,
    });
    expect(await refundRequestOf(orderId)).toMatchObject({
      cause: "cancellation",
      announcedCents: 1_055,
      generation: 1,
      attempts: 1,
      stripeRefundId: "re_e2e_1",
      claimToken: null,
    });
    expect(stripe.calls).toMatchObject([
      { paymentIntentId: intent, key: `lfd-order-refund:${orderId}:1:1` },
    ]);
    expect(await ledgerOf(orderId)).toEqual([
      { stripeRefundId: "re_e2e_1", amountCents: 1_055, status: "pending" },
    ]);
    expect((await detail(orderId)).refund).toMatchObject({ state: "issued", retryable: false });

    const [issued] = stripe.refunds;
    await webhook(intent ?? "", issued ?? fail(), "succeeded");
    await deliver();

    expect((await orderState(orderId)).paymentStatus).toBe(PaymentStatus.refunded);
    expect(
      await ctx.prisma.outboxMessage.count({ where: { type: "order.refund_succeeded" } }),
    ).toBe(1);
    expect((await detail(orderId)).refund).toMatchObject({ state: "refunded" });
    expect(await attention()).toEqual([]);
  });

  it("courriel variante `paid`, journal `regime: paid` avec le montant promis", async () => {
    const { orderId } = await seedPaidOrder();

    await cancelRequest(orderId).expect(204);
    await deliver();

    expect(cancelledMails()).toHaveLength(1);
    expect(cancelledMails()[0]?.data).toMatchObject({
      regime: "paid",
      refund: { announcedCents: 1_055 },
    });
    const journal = await ctx.prisma.activityEvent.findMany({ where: { type: "order.cancelled" } });
    expect(journal[0]?.payload).toMatchObject({
      regime: "paid",
      refund: { announcedCents: 1_055 },
    });
  });

  it("aucune facture carte, aucun avoir, aucune cloche « sans avoir »", async () => {
    const { orderId, intent } = await seedPaidOrder();
    await cancelRequest(orderId).expect(204);
    await deliver();
    await webhook(intent ?? "", stripe.refunds[0] ?? fail(), "succeeded");
    await deliver();

    expect(await ctx.prisma.invoice.count()).toBe(0);
    expect(
      await ctx.prisma.staffNotification.count({ where: { kind: "order.refund_not_credited" } }),
    ).toBe(0);
  });

  it("déjà remboursée en entier depuis Stripe : annulée SANS demande, courriel « déjà remboursé »", async () => {
    // Par le vrai chemin : le webhook d'un remboursement total fait passer `refunded`.
    const { orderId, intent } = await seedPaidOrder();
    await webhook(
      intent ?? "",
      { refundId: "re_tableau", amountCents: 1_055, createdAt: new Date(daysAgo(1)) },
      "succeeded",
    );
    expect((await orderState(orderId)).paymentStatus).toBe(PaymentStatus.refunded);

    await cancelRequest(orderId).expect(204);
    await deliver();

    expect(await refundRequestOf(orderId)).toBeNull();
    expect(stripe.calls).toEqual([]);
    expect(cancelledMails()[0]?.data).toMatchObject({ regime: "paid", refund: null });
  });

  it("un remboursement partiel antérieur : on rend le reste", async () => {
    const { orderId, intent } = await seedPaidOrder();
    await webhook(
      intent ?? "",
      { refundId: "re_tableau", amountCents: 300, createdAt: new Date(daysAgo(1)) },
      "succeeded",
    );
    stripe.refunds.push({
      refundId: "re_tableau",
      amountCents: 300,
      currency: "eur",
      status: "succeeded",
      createdAt: new Date(daysAgo(1)),
      paymentIntentId: intent ?? "",
      requestId: "",
      generation: 0,
      key: "",
    });

    await cancelRequest(orderId).expect(204);
    await deliver();

    expect((await refundRequestOf(orderId))?.announcedCents).toBe(755);
    expect(stripe.refunds.at(-1)?.amountCents).toBe(755);
  });

  it("un remboursement en vol refuse, avec son montant", async () => {
    const { orderId, intent } = await seedPaidOrder();
    await webhook(
      intent ?? "",
      { refundId: "re_vol", amountCents: 300, createdAt: new Date(daysAgo(1)) },
      "pending",
    );

    const response = await cancelRequest(orderId);

    expect(response.status).toBe(409);
    expect(codeOf(response)).toBe("orders.cancel.refund_in_flight");
    expect((await orderState(orderId)).status).toBe(OrderStatus.placed);
  });

  it("la carte aboutit pendant le clic : `paid_just_now` ; une fois payée, l'annulation passe par C4", async () => {
    const { orderId } = await seedOrder();
    scene.cancellation = { kind: "already_paid" };

    const response = await cancelRequest(orderId);
    expect(response.status).toBe(409);
    expect(codeOf(response)).toBe("orders.cancel.paid_just_now");

    await ctx.prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: PaymentStatus.paid },
    });
    await cancelRequest(orderId).expect(204);
    await deliver();
    expect(await refundRequestOf(orderId)).not.toBeNull();
  });
});

describe("Stripe ne répond pas, ou refuse", () => {
  it("trois `unavailable` puis le balayage réussit : trois essais comptés, une cloche, un remboursement", async () => {
    const { orderId } = await seedPaidOrder();
    stripe.script.push({ kind: "unavailable" }, { kind: "unavailable" }, { kind: "unavailable" });

    await cancelRequest(orderId).expect(204);
    await deliver();
    for (let turn = 0; turn < 3; turn += 1) {
      advanceWallPastRetries();
      await sweepRefunds().expect(200);
    }

    expect(stripe.calls.map((call) => call.key.split(":").slice(2).join(":"))).toEqual([
      "1:1",
      "1:2",
      "1:3",
      "1:4",
    ]);
    expect(await refundRequestOf(orderId)).toMatchObject({
      attempts: 4,
      round: 4,
      stripeRefundId: "re_e2e_1",
    });
    expect(await attention()).toHaveLength(1);
    expect(stripe.refunds).toHaveLength(1);
  });

  it("`declined` : cloche, plus d'échéance, le balayage l'ignore ; « Relancer » la reprend (202)", async () => {
    const { orderId } = await seedPaidOrder();
    stripe.script.push({ kind: "declined", code: "charge_disputed" });

    await cancelRequest(orderId).expect(204);
    await deliver();
    advanceWallPastRetries();
    await sweepRefunds().expect(200);

    expect(stripe.calls).toHaveLength(1);
    expect(await refundRequestOf(orderId)).toMatchObject({
      nextAttemptAt: null,
      lastFailure: "declined:charge_disputed",
    });
    expect((await attention())[0]?.subject).toContain("Remboursement refusé par Stripe");
    expect((await detail(orderId)).refund).toMatchObject({ state: "to_issue", retryable: true });

    await retry(orderId).expect(202);
    await deliver();
    expect(stripe.refunds).toHaveLength(1);
  });

  it("`nothing_left` : cloche « vérifier le tableau de bord »", async () => {
    const { orderId } = await seedPaidOrder();
    stripe.script.push({ kind: "nothing_left" });

    await cancelRequest(orderId).expect(204);
    await deliver();

    expect((await attention())[0]?.subject).toContain("Rien à rembourser chez Stripe");
  });

  it("`refund.failed` puis « Relancer » : génération 2, la recherche ignore l'échoué, un second re_…", async () => {
    const { orderId, intent } = await seedPaidOrder();
    await cancelRequest(orderId).expect(204);
    await deliver();
    const first = stripe.refunds[0] ?? fail();
    stripe.refunds[0] = { ...first, status: "failed" };
    await webhook(intent ?? "", first, "failed");
    await deliver();

    expect((await attention())[0]?.subject).toContain("Remboursement échoué chez Stripe");
    expect((await detail(orderId)).refund).toMatchObject({ state: "failed", retryable: true });
    await retry(orderId).expect(202);
    await deliver();

    expect(await refundRequestOf(orderId)).toMatchObject({
      generation: 2,
      stripeRefundId: "re_e2e_2",
    });
    expect(stripe.calls.at(-1)?.key).toBe(`lfd-order-refund:${orderId}:2:1`);
    expect((await ledgerOf(orderId)).map((refund) => refund.status)).toEqual(["failed", "pending"]);
  });
});

function fail(): never {
  throw new Error("le remboursement attendu manque");
}

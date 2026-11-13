/**
 * E2E des **refus et de la reprise du reste d'une carte** (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 2.1, § 4.4,
 * § 4.5 et § 9).
 *
 * Ce que seul le vrai SQL prouve : un reste que les paiements ne couvrent pas
 * (`not_covered`) se journalise sans rien demander, la fiche montre
 * « Rembourser le reste » avec sa cause, et, la cause réparée (« Réglé
 * autrement »), le geste rejoué sous la même clé d'intention ne demande
 * qu'une fois ; une carte pas encore encaissée, ou une hausse par carte
 * vivante, refusent la décision avec leur code — la première ne l'atteint
 * même pas : une carte due n'entre pas au colisage.
 */
import type {
  AdminOrderView,
  CardComplementPaymentView,
  OrderRevisionQuoteView,
} from "@lfd/contracts";

import { CardRefunds } from "../src/card-payment/channels/requests/index.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import type { E2eContext } from "./e2e-harness.js";
import { jsonBody } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { pickupSite, placeOrder } from "./order-factory.js";
import { settleCardPayments } from "./card-payments.js";
import { CROISSANT, MEMBER, SERVICE_DAY, STAFF } from "./production-day-fixture.js";
import { decide, drawn, report } from "./shortfall-decision-scene.js";
import {
  billableOf,
  bootShortfallCardScene,
  type CapturingMailer,
  departIncomplete,
  paidCardShortfall,
  refundSettles,
  relayAll,
  resetScene,
  type ScriptedRefunds,
  shortfallRequests,
} from "./shortfall-card-refund-scene.js";

let ctx: E2eContext;
let issued: string[];
let mailer: CapturingMailer;
let refunds: ScriptedRefunds;

beforeAll(async () => {
  ({ ctx, issued, mailer, refunds } = await bootShortfallCardScene());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await resetScene(ctx, mailer, refunds);
});

const fiche = async (orderId: string): Promise<AdminOrderView> =>
  jsonBody<AdminOrderView>(await ctx.asSub(STAFF).get(`/admin/orders/${orderId}`).expect(200));

const refundTheRest = (orderId: string, key: string) =>
  ctx.asSub(STAFF).post(`/admin/orders/${orderId}/shortfall-refund`).set(INTENT_KEY, key);

/**
 * Une demande d'ajustement de `askedCents` que le prestataire émet pour
 * `issuedCents` : arrêtée (`issued_amount_mismatch`), le `re_…` rendu. Elle
 * annonce encore `askedCents` au reste du paiement — ce qui laisse le reste
 * d'un départ incomplet sans couverture.
 */
async function mismatchedAdjustment(
  orderId: string,
  askedCents: number,
  issuedCents: number,
): Promise<string> {
  const [payment] = (await shortfallRequests(ctx, orderId)).payments;
  refunds.script.push({ kind: "issue_amount", amountCents: issuedCents });
  const requested = await ctx.app.get(UnitOfWork).run(() =>
    ctx.app.get(CardRefunds).requestAmount({
      paymentId: payment?.id ?? "",
      amountCents: askedCents,
      nature: "adjustment",
      reason: "revision",
      requestedBy: null,
    }),
  );
  await ctx.drain();
  const request = await ctx.prisma.cardRefundRequest.findUniqueOrThrow({
    where: { id: requested.requestId },
  });
  expect(request.state).toBe("stopped");
  await refundSettles(ctx, refunds.forRequest(requested.requestId));
  return requested.requestId;
}

describe("« Rembourser le reste » après un reste non couvert (plan E9, § 4.5)", () => {
  it("journalise `not_covered`, puis, réparé, rejoué sous la même clé, ne demande qu'une fois", async () => {
    const order = await paidCardShortfall(ctx, issued, "individual", 6);
    const { chargedCents } = await shortfallRequests(ctx, order.id);
    const askedCents = Math.round(chargedCents * 0.3);
    const blocking = await mismatchedAdjustment(
      order.id,
      askedCents,
      Math.round(chargedCents * 0.25),
    );
    // Une baisse rendue n'est pas le reste d'un départ : aucun courriel du reste.
    expect(mailer.of("customer.order-shortfall-refunded")).toEqual([]);

    await departIncomplete(ctx, order);

    expect((await shortfallRequests(ctx, order.id)).requests).toEqual([]);
    const blocked = await ctx.prisma.activityEvent.findMany({
      where: { type: "order.shortfall_refund_blocked", subjectId: order.id },
      select: { payload: true },
    });
    expect(blocked.map((fact) => fact.payload)).toEqual([
      expect.objectContaining({ cause: "not_covered", stoppedAmount: true }),
    ]);
    expect((await fiche(order.id)).shortfallRefund?.cause).toBe("not_covered");

    await ctx
      .asSub(STAFF)
      .post(`/admin/card-payments/refund-requests/${blocking}/settle-elsewhere`)
      .send({ reason: "Rendu par virement" })
      .expect(204);
    await relayAll(ctx);
    const repaired = (await fiche(order.id)).shortfallRefund;
    expect(repaired?.cause).toBeNull();

    const key = freshIntent();
    await refundTheRest(order.id, key).expect(202);
    const replayed = await refundTheRest(order.id, key);
    await ctx.drain();

    expect(replayed.status).toBeLessThan(300);
    const { requests } = await shortfallRequests(ctx, order.id);
    expect(requests.map((request) => request.announcedCents)).toEqual([repaired?.amountCents]);
    expect(requests[0]?.requestedBy).not.toBeNull();
    // Une AUTRE intention retrouve la demande sous le verrou : rien à rembourser.
    const another = await refundTheRest(order.id, freshIntent()).expect(409);
    expect(jsonBody<{ code: string }>(another).code).toBe("orders.shortfall_refund.nothing");
    expect(repaired?.amountCents).toBe(
      chargedCents -
        (await billableOf(ctx, order.id)) -
        askedCents -
        (refunds.issued[0]?.amountCents ?? 0),
    );
  });
});

describe("les refus de la décision par carte (plan E9, § 2.1)", () => {
  /**
   * Le refus `card_unpaid` est un filet que le parcours n'atteint pas : une
   * carte due n'entre pas au plan du soir (`planWhere`), donc jamais au
   * colisage, donc aucun manque ne se signale et la décision n'a rien à
   * trancher. Le refus lui-même est éprouvé au domaine
   * (`shortfall-decidability.spec.ts`) et au comptoir.
   */
  it("une carte pas encore encaissée n'atteint pas la décision : ni colisage, ni manque", async () => {
    const user = await createUser(ctx.prisma, { auth0Sub: MEMBER });
    const placed = await placeOrder(ctx, {
      buyerUserId: user.id,
      forDay: SERVICE_DAY,
      fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
      lines: [{ sku: CROISSANT, quantity: 3 }],
    });
    issued.splice(0);
    // Seule commande du jour, et pas au plan : la fournée n'a rien à clore.
    const closing = await ctx.asSub(STAFF).post(`/admin/production/batch/${SERVICE_DAY}/close`);
    await ctx.drain();
    expect({ status: closing.status, code: jsonBody<{ code: string }>(closing).code }).toEqual({
      status: 409,
      code: "production.day.empty",
    });

    const row = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: placed.id },
      select: { paymentStatus: true },
    });
    // Toujours `due` : jamais encaissée (la clôture manquée la passe en `failed`).
    expect(["pending", "failed"]).toContain(row.paymentStatus);
    expect(await report(ctx, placed.id)).not.toBe(204);
    expect(await decide(ctx, placed.id)).toEqual({
      status: 409,
      code: "orders.shortfall.nothing_to_decide",
    });
  });

  it("une hausse par carte vivante refuse la décision : 409 `card_increase_pending`", async () => {
    const user = await createUser(ctx.prisma, { auth0Sub: MEMBER });
    const pickupId = await pickupSite(ctx.prisma);
    const placed = await placeOrder(ctx, {
      buyerUserId: user.id,
      forDay: SERVICE_DAY,
      fulfillment: { method: "pickup", pickupSiteId: pickupId },
      lines: [{ sku: CROISSANT, quantity: 3 }],
    });
    await settleCardPayments(ctx, issued);
    await proposeIncrease(placed.id, pickupId, 6);
    const order = await drawn(ctx, placed, 1);
    expect(await report(ctx, order.id)).toBe(204);

    const refused = await decide(ctx, order.id);

    expect(refused).toEqual({
      status: 409,
      code: "orders.shortfall_decision.card_increase_pending",
    });
  });
});

/** La hausse demandée par le client au total du devis, son complément pas encore payé. */
async function proposeIncrease(orderId: string, pickupId: string, quantity: number): Promise<void> {
  const content = {
    requestedDeliveryDate: SERVICE_DAY,
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: [{ sku: CROISSANT, quantity }],
  };
  const seen = jsonBody<OrderRevisionQuoteView>(
    await ctx.asSub(MEMBER).post(`/orders/${orderId}/revisions/quote`).send(content).expect(200),
  );
  jsonBody<CardComplementPaymentView>(
    await ctx
      .asSub(MEMBER)
      .post(`/orders/${orderId}/revisions/card-increase`)
      .set(INTENT_KEY, freshIntent())
      .send({ expectedRevision: 0, expectedTotalCents: seen.totalCents, ...content })
      .expect(200),
  );
  issued.splice(0);
}

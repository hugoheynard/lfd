/**
 * **La baisse d'une commande payée par carte, sur le vrai Postgres** (plan
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.12).
 *
 * Ce que seul le vrai chemin prouve : la révision et sa demande `amount`
 * s'écrivent dans la même transaction, et le prestataire n'est appelé
 * qu'APRÈS validation ; l'équipe baisse aussi ; une hausse qui attend refuse
 * la baisse ; le bon et la carte déjà rendue refusent ; le total égal passe
 * sans argent ; l'e-mail « commande modifiée » dit le remboursement.
 */
import { b2bMailTemplates, type B2bMails } from "../src/mail/templates/mail-templates.js";
import { E2E_STAFF_ID } from "./e2e-harness.js";
import { recordCardEvent } from "./card-payments.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import {
  bootCardRefundScene,
  buyer,
  cardInvoiceHolds,
  cards,
  content,
  deliver,
  orderOf,
  paidButNotApplied,
  paidOrder,
  quoteOf,
  refundRequestsOf,
  resetCardRefundScene,
  revise,
  scene,
  sentMails,
  willRefund,
} from "./order-revision-card-refund-scene.js";

beforeAll(async () => {
  await bootCardRefundScene();
});

afterAll(async () => {
  await scene().close();
});

beforeEach(async () => {
  await resetCardRefundScene();
});

describe("La baisse (R1, R2, R5)", () => {
  it("le client : le devis annonce le remboursement, la commande baisse, la demande part après validation", async () => {
    const order = await paidOrder(6);
    const seen = await quoteOf(order, 4);
    const refundCents = order.totalCents - seen.totalCents;
    expect(seen.settlement).toEqual({ kind: "card_refund", refundCents });
    willRefund(refundCents);

    await revise(200, order, 4);
    await deliver();

    expect(await orderOf(order.id)).toMatchObject({
      totalCents: seen.totalCents,
      revision: 1,
      paymentStatus: "paid",
    });
    const [request] = await refundRequestsOf(order.id);
    expect(request).toMatchObject({
      form: "amount",
      nature: "adjustment",
      reason: "revision",
      announcedCents: refundCents,
      requestedBy: null,
    });
    expect(cards.provider.refundCalls.map((call) => call.params.amountCents)).toEqual([
      refundCents,
    ]);
    await cardInvoiceHolds(order.id);
  });

  it("l'équipe baisse aussi : la demande porte sa fiche", async () => {
    const order = await paidOrder(6);

    await revise(200, order, 3, "staff");

    const [request] = await refundRequestsOf(order.id);
    expect(request).toMatchObject({ reason: "revision", requestedBy: E2E_STAFF_ID });
  });

  it("statut `paid` gardé après un remboursement partiel réussi", async () => {
    const order = await paidOrder(6);
    const seen = await quoteOf(order, 5);
    willRefund(order.totalCents - seen.totalCents);

    await revise(200, order, 5);
    await deliver();

    expect((await orderOf(order.id)).paymentStatus).toBe("paid");
    expect((await refundRequestsOf(order.id)).map((request) => request.state)).toEqual([
      "refunded",
    ]);
  });

  it("l'e-mail « commande modifiée » d'une baisse dit le remboursement sur la carte", async () => {
    const order = await paidOrder(6);
    const seen = await quoteOf(order, 4);

    await revise(200, order, 4);
    await deliver();

    const mails = sentMails.filter((mail) => mail.template === "customer.order-revised");
    expect(mails).toHaveLength(1);
    const data = mails[0]?.data as B2bMails["customer.order-revised"];
    expect(data).toMatchObject({
      previousTotalCents: order.totalCents,
      totalCents: seen.totalCents,
      moneyNote: "card_refunded",
    });
    const rendered = b2bMailTemplates({ supportEmail: "a@lfc.test", backOfficeUrl: "" })[
      "customer.order-revised"
    ](data);
    expect(rendered.text).toContain("remboursés sur votre carte");
  });

  it("Q2 : un changement à total égal passe, sans aucune demande", async () => {
    const order = await paidOrder(6);
    const seen = await quoteOf(order, 6, "customer", "porte B");
    expect(seen.settlement).toEqual({ kind: "as_placed" });

    await revise(200, order, 6, "customer", "porte B");

    expect(await orderOf(order.id)).toMatchObject({ totalCents: order.totalCents, revision: 1 });
    expect(await refundRequestsOf(order.id)).toEqual([]);
  });
});

describe("Les refus (R3, R10, R1)", () => {
  it("R3 : refusée pendant un complément `awaiting_payment`, sans rien écrire", async () => {
    const order = await paidOrder(6);
    const seen = await quoteOf(order, 9);
    await buyer()
      .post(`/orders/${order.id}/revisions/card-increase`)
      .set(INTENT_KEY, freshIntent())
      .send({
        expectedRevision: 0,
        expectedTotalCents: seen.totalCents,
        ...content(order.pickupId, 9),
      })
      .expect(200);

    const refused = await revise(409, order, 4);

    expect(refused.body).toMatchObject({ code: "orders.card_increase.pending" });
    expect(JSON.stringify(refused.body)).toContain("payez-le ou abandonnez-le");
    expect(await orderOf(order.id)).toMatchObject({ revision: 0, totalCents: order.totalCents });
    expect(await refundRequestsOf(order.id)).toEqual([]);
  });

  it("R3 : refusée pendant un complément payé mais pas appliqué (`ready`), sans rien écrire", async () => {
    const order = await paidOrder(6);
    await paidButNotApplied(order, 9);

    const refused = await revise(409, order, 4);

    expect(refused.body).toMatchObject({ code: "orders.card_increase.pending" });
    expect(JSON.stringify(refused.body)).toContain("attend d'être appliqué");
    expect(await orderOf(order.id)).toMatchObject({ revision: 0, totalCents: order.totalCents });
    expect(await refundRequestsOf(order.id)).toEqual([]);
  });

  it("R1 : une commande déjà remboursée en entier est refusée, avec sa raison", async () => {
    const order = await paidOrder(6);
    await recordCardEvent(scene(), (eventId) => ({
      kind: "refund",
      eventId,
      eventType: "refund.created",
      providerRef: order.providerRef,
      refundId: "re_tableau_de_bord",
      amountCents: order.totalCents,
      currency: "eur",
      status: "succeeded",
      createdAt: new Date(),
    }));
    expect((await orderOf(order.id)).paymentStatus).toBe("refunded");

    const seen = await quoteOf(order, 4);
    expect(seen.settlement).toEqual({ kind: "card_not_revisable", reason: "refunded" });
    const refused = await buyer()
      .post(`/orders/${order.id}/revisions`)
      .send({
        expectedRevision: 0,
        expectedTotalCents: seen.totalCents,
        ...content(order.pickupId, 4),
      })
      .expect(409);
    expect(refused.body).toMatchObject({ code: "orders.revise.card_settled" });
    expect(JSON.stringify(refused.body)).toContain("déjà été remboursée en entier");
  });
});

/**
 * **La baisse carte dans le temps, sur le vrai Postgres** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.12 :
 * la répartition, les baisses qui s'additionnent, la hausse puis la baisse,
 * le bon).
 *
 * Ce que seul le vrai chemin prouve : la baisse après une hausse appliquée
 * rend sur le complément et la facture tombe juste ; deux baisses
 * s'additionnent ; une annulation après une baisse ne rend rien deux fois,
 * même quand la demande de la baisse est arrêtée ; une commande payée avant
 * le bloc carte est adoptée puis remboursée ; une baisse qui touche deux
 * paiements écrit deux demandes dans la même transaction ; le bon refuse.
 */
import { ConvertLoyaltyPointsCommand } from "../src/lafoliecoffee/loyalty/application/commands/convert-loyalty-points.command.js";
import { CommandBus } from "@nestjs/cqrs";

import { E2E_STAFF_SUB } from "./e2e-harness.js";
import {
  appliedIncrease,
  bootCardRefundScene,
  BUYER,
  cardInvoiceHolds,
  content,
  deliver,
  orderOf,
  paidOrder,
  paymentsOf,
  positionOf,
  quoteOf,
  refundRequestsOf,
  resetCardRefundScene,
  revise,
  scene,
  staff,
  willRefund,
} from "./order-revision-card-refund-scene.js";
import { createUser } from "./factories.js";

beforeAll(async () => {
  await bootCardRefundScene();
});

afterAll(async () => {
  await scene().close();
});

beforeEach(async () => {
  await resetCardRefundScene();
});

describe("Après une hausse (R4, R9)", () => {
  it("rend d'abord sur le complément ; la facture carte tient au nouveau total", async () => {
    const order = await paidOrder(6);
    const raised = await appliedIncrease(order, 8);
    const seen = await quoteOf(order, 7);
    const refundCents = raised - seen.totalCents;
    willRefund(refundCents);

    await revise(200, order, 7);
    await deliver();

    const [, complement] = await paymentsOf(order.id);
    expect(complement?.role).toBe("complement");
    const requests = await refundRequestsOf(order.id);
    expect(requests.map((request) => [request.paymentId, request.announcedCents])).toEqual([
      [complement?.id, refundCents],
    ]);
    await cardInvoiceHolds(order.id);
  });

  it("une baisse plus grande que le complément touche deux paiements, deux demandes", async () => {
    const order = await paidOrder(6);
    const raised = await appliedIncrease(order, 8);
    const seen = await quoteOf(order, 4);

    await revise(200, order, 4);

    const [first, complement] = await paymentsOf(order.id);
    const requests = await refundRequestsOf(order.id);
    const complementCents = raised - order.totalCents;
    // Les deux demandes naissent dans la même transaction, au même instant :
    // leur ordre de lecture n'est pas un fait, le montant par paiement l'est.
    expect(
      Object.fromEntries(requests.map((request) => [request.paymentId, request.announcedCents])),
    ).toEqual({
      [complement?.id ?? ""]: complementCents,
      [first?.id ?? ""]: raised - seen.totalCents - complementCents,
    });
  });
});

describe("Plusieurs gestes (R8, annulation)", () => {
  it("deux baisses de suite s'additionnent, chacune sa demande", async () => {
    const order = await paidOrder(6);
    const first = await quoteOf(order, 5);
    await revise(200, order, 5);
    const second = await quoteOf(order, 3);

    await revise(200, order, 3);

    expect((await refundRequestsOf(order.id)).map((request) => request.announcedCents)).toEqual([
      order.totalCents - first.totalCents,
      first.totalCents - second.totalCents,
    ]);
  });

  it("baisse puis annulation : l'annulation rend le reste, rien deux fois", async () => {
    const order = await paidOrder(6);
    const seen = await quoteOf(order, 4);
    await revise(200, order, 4);

    await staff()
      .post(`/admin/orders/${order.id}/cancel`)
      .send({ reason: "Le client ne vient plus." })
      .expect(204);

    const requests = await refundRequestsOf(order.id);
    expect(requests.map((request) => [request.form, request.announcedCents])).toEqual([
      ["amount", order.totalCents - seen.totalCents],
      ["remainder", seen.totalCents],
    ]);
  });

  it("baisse arrêtée puis annulation : les montants à relancer restent visibles, rien deux fois", async () => {
    const order = await paidOrder(6);
    const seen = await quoteOf(order, 4);
    const refundCents = order.totalCents - seen.totalCents;
    willRefund(refundCents, "failed");
    await revise(200, order, 4);
    await deliver();
    expect((await refundRequestsOf(order.id)).map((request) => request.state)).toEqual(["stopped"]);

    await staff()
      .post(`/admin/orders/${order.id}/cancel`)
      .send({ reason: "Le client ne vient plus." })
      .expect(204);

    const requests = await refundRequestsOf(order.id);
    expect(
      requests.map((request) => [request.form, request.state, request.announcedCents]),
    ).toEqual([
      ["amount", "stopped", refundCents],
      ["remainder", expect.any(String) as string, seen.totalCents],
    ]);
    const position = await positionOf(order.id);
    expect(position?.openRequests.some((open) => open.state === "stopped")).toBe(true);
  });
});

describe("Les cas d'avant et le bon (R4, R10)", () => {
  it("une commande payée avant le bloc carte, sans ligne : adoptée puis remboursée", async () => {
    const order = await paidOrder(6);
    // Exception gardée (cf. `order-staff-cancel-orders.ts`) : l'image d'avant
    // P0 n'existe qu'en purgeant la ligne que la passation rattache désormais.
    await scene().prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL card_payment.purge = 'on'`;
      await tx.cardPayment.deleteMany({ where: { subjectType: "order", subjectId: order.id } });
    });
    expect(await paymentsOf(order.id)).toEqual([]);
    const seen = await quoteOf(order, 4);

    await revise(200, order, 4);

    const [adopted] = await paymentsOf(order.id);
    expect(adopted?.role).toBe("first");
    expect((await refundRequestsOf(order.id)).map((request) => request.announcedCents)).toEqual([
      order.totalCents - seen.totalCents,
    ]);
  });

  it("R10 : une baisse sous la part du bon reste refusée, sans demande", async () => {
    await scene()
      .asSub(E2E_STAFF_SUB)
      .put("/admin/loyalty/settings")
      .send({
        pointsPerStep: 1_000,
        stepValueCents: 500,
        openToPublic: true,
        openToPro: false,
        voucherValidityDays: 365,
        welcomeBonusPoints: null,
      })
      .expect(204);
    const user = await createUser(scene().prisma, { auth0Sub: BUYER, firstName: "Léa" });
    await staff()
      .post("/admin/loyalty/adjustments")
      .send({ holderKind: "user", holderId: user.id, points: 1_000, reason: "reprise" })
      .expect(204);
    const voucherId = await scene()
      .app.get(CommandBus)
      .execute<ConvertLoyaltyPointsCommand, string>(
        new ConvertLoyaltyPointsCommand("user", user.id, user.id, 1, null),
      );
    const order = await paidOrder(6, voucherId);

    const quoted = await scene()
      .asSub(BUYER)
      .post(`/orders/${order.id}/revisions/quote`)
      .send(content(order.pickupId, 1))
      .expect(409);
    const refused = await scene()
      .asSub(BUYER)
      .post(`/orders/${order.id}/revisions`)
      .send({ expectedRevision: 0, expectedTotalCents: 0, ...content(order.pickupId, 1) })
      .expect(409);

    expect(quoted.body).toMatchObject({ code: "orders.revise.below_voucher" });
    expect(refused.body).toMatchObject({ code: "orders.revise.below_voucher" });
    expect(await orderOf(order.id)).toMatchObject({ revision: 0 });
    expect(await refundRequestsOf(order.id)).toEqual([]);
  });
});

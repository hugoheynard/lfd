/**
 * E2E des **courses de l'annulation staff** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C3.4 et C3.4 ter) :
 * deux clics, deux membres de l'équipe, la clôture et le retirage qui lisent
 * les commandes avant leur verrou, et la transaction qui tombe après Stripe.
 *
 * La scène est partagée avec `order-staff-cancel.e2e-spec.ts`.
 */
import type request from "supertest";

import { OrderStatus, PaymentStatus } from "../src/platform/database/client/client.js";
import { E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import {
  bootScene,
  cancelledMails,
  cancelRequest,
  DAY,
  deliver,
  orderState,
  resetScene,
  scene,
  withdrawals,
} from "./order-staff-cancel-scene.js";
import { seedFreeOrder, seedOrder } from "./order-staff-cancel-orders.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootScene();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await resetScene();
});

const codeOf = (response: request.Response) => jsonBody<{ readonly code: string }>(response).code;

/** Un second membre de l'équipe, administrateur comme l'opérateur. */
async function secondStaff(): Promise<string> {
  const sub = "staff-second";
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Paul",
      lastName: "Martin",
      email: "paul@lfc.test",
      role: "admin",
      status: "active",
      auth0Id: sub,
    },
  });
  return sub;
}

const closeDay = () => ctx.asSub(E2E_STAFF_SUB).post(`/admin/production/batch/${DAY}/close`);
const retakeDay = () => ctx.asSub(E2E_STAFF_SUB).post(`/admin/production/worksheet/${DAY}/retake`);
const inscribed = () =>
  ctx.prisma.productionOrder.findMany({ where: { serviceDay: DAY }, select: { orderId: true } });

describe("deux annulations simultanées", () => {
  it("double clic : une annulation, un courriel, l'autre « déjà annulée » (409, jamais 500)", async () => {
    const { orderId } = await seedOrder();

    const responses = await Promise.all([cancelRequest(orderId), cancelRequest(orderId)]);
    await deliver();

    expect(responses.map((response) => response.status).sort()).toEqual([204, 409]);
    const refused = responses.find((response) => response.status === 409);
    expect(refused === undefined ? null : codeOf(refused)).toBe("orders.cancel.already_cancelled");
    expect(cancelledMails()).toHaveLength(1);
    expect(await withdrawals()).toHaveLength(1);
  });

  it("deux membres de l'équipe : un seul gagne, un seul auteur, un seul témoin au journal", async () => {
    const { orderId } = await seedFreeOrder();
    const other = await secondStaff();

    const responses = await Promise.all([cancelRequest(orderId), cancelRequest(orderId, other)]);
    await deliver();

    expect(responses.map((response) => response.status).sort()).toEqual([204, 409]);
    expect(cancelledMails()).toHaveLength(1);
    expect(await ctx.prisma.activityEvent.count({ where: { type: "order.cancelled" } })).toBe(1);
  });
});

describe("la course avec la clôture (C3.4)", () => {
  it("annulée entre la lecture de la clôture et son verrou : absente du compte à produire", async () => {
    const paid = await seedOrder({ payment: PaymentStatus.paid });
    const free = await seedFreeOrder();
    scene.afterProducibleRead = async () => {
      await cancelRequest(free.orderId).expect(204);
    };

    const response = await closeDay();
    await deliver();

    expect(response.status).toBe(201);
    expect(jsonBody<{ readonly absorbed: number }>(response).absorbed).toBe(1);
    expect(await inscribed()).toEqual([{ orderId: paid.orderId }]);
    expect((await orderState(free.orderId)).status).toBe(OrderStatus.cancelled);
    expect((await orderState(paid.orderId)).status).toBe(OrderStatus.confirmed);
  });

  it("inscrite par le fournil mais encore `placed` (abonné en retard) : refus nommé, rien n'est écrit", async () => {
    await seedOrder({ payment: PaymentStatus.paid });
    const free = await seedFreeOrder();
    await closeDay().expect(201);
    // Livrer d'abord : sinon l'abonné, réveillé après la validation, repasserait
    // `confirmed` après nous.
    await deliver();
    // L'abonné du commerce qui passe `confirmed` n'a pas encore tourné : on le
    // simule en remettant la commande à `placed` — l'état que B1 décrit.
    await ctx.prisma.order.update({
      where: { id: free.orderId },
      data: { status: OrderStatus.placed, confirmedAt: null },
    });

    const response = await cancelRequest(free.orderId);

    expect(response.status).toBe(409);
    expect(codeOf(response)).toBe("orders.cancel.inscribed");
    expect(await withdrawals()).toEqual([]);
    expect((await orderState(free.orderId)).status).toBe(OrderStatus.placed);
  });
});

describe("la course avec le retirage (C3.4)", () => {
  it("annulée entre la lecture du retirage et son verrou : non absorbée, absente du fait retiré", async () => {
    const first = await seedOrder({ payment: PaymentStatus.paid });
    await closeDay().expect(201);
    await deliver();
    // Après l'arrêt, seule l'équipe saisit encore pour la journée.
    const late = await seedOrder({ payment: PaymentStatus.paid, byStaff: true });
    const cancelled = await seedOrder({ payment: PaymentStatus.not_required, byStaff: true });
    scene.afterProducibleRead = async () => {
      await cancelRequest(cancelled.orderId).expect(204);
    };

    const response = await retakeDay();
    await deliver();

    expect(response.status).toBe(201);
    expect(jsonBody<{ readonly absorbed: number }>(response).absorbed).toBe(1);
    expect((await inscribed()).map((row) => row.orderId).sort()).toEqual(
      [first.orderId, late.orderId].sort(),
    );
    const retaken = await ctx.prisma.outboxMessage.findMany({
      where: { type: "production.day_retaken" },
      select: { payload: true },
    });
    expect(retaken).toHaveLength(1);
    expect(retaken[0]?.payload).toMatchObject({ orderIds: [late.orderId] });
  });
});

describe("la transaction qui échoue après Stripe (C3.4 ter)", () => {
  it("un premier échec est rejoué dans la requête : 204, une annulation, un courriel", async () => {
    const { orderId } = await seedOrder();
    scene.withdrawalFailures = 1;

    await cancelRequest(orderId).expect(204);
    await deliver();

    expect(scene.cancelledIntents).toHaveLength(1);
    expect((await orderState(orderId)).status).toBe(OrderStatus.cancelled);
    expect(cancelledMails()).toHaveLength(1);
  });

  it("deux échecs : 500 qui dit de relancer ; la relance obtient `already_cancelled` et écrit", async () => {
    const { orderId } = await seedOrder();
    scene.withdrawalFailures = 2;

    const failed = await cancelRequest(orderId);

    expect(failed.status).toBe(500);
    expect(codeOf(failed)).toBe("orders.cancel.not_recorded");
    // ⚠️ Le filtre masque le message d'une erreur technique (« Une erreur
    // technique est survenue. ») : la phrase du plan ne sort PAS, seul le code
    // le fait — c'est à l'écran de la dire à partir de lui.
    expect(await orderState(orderId)).toMatchObject({
      status: OrderStatus.placed,
      cancelledBy: null,
    });
    expect(await withdrawals()).toEqual([]);

    scene.cancellation = { kind: "already_cancelled" };
    await cancelRequest(orderId).expect(204);

    expect((await orderState(orderId)).status).toBe(OrderStatus.cancelled);
  });
});

describe("la course avec la remise au comptoir", () => {
  /**
   * Régression (2026-10-25) : remise au comptoir et annulation staff lancées
   * ensemble passaient TOUTES LES DEUX, trois fois sur trois — une
   * attestation `order_handover` écrite (201) sur une commande annulée et
   * remboursée (204). Les deux gestes prennent désormais la même ligne
   * `orders` en `FOR UPDATE` : exactement un gagne, l'autre refuse en 409 en
   * nommant le cas (C3.6). Rejoué cinq fois, parce qu'une course gagnée par
   * hasard ne prouve rien.
   */
  it.each([1, 2, 3, 4, 5])(
    "remise × annulation en parallèle (essai %i) : exactement un gagnant, aucune attestation orpheline",
    async () => {
      const { orderId, orderNumber } = await seedOrder({ payment: PaymentStatus.paid });

      const [handed, cancelled] = await Promise.all([
        ctx.asSub(E2E_STAFF_SUB).post(`/admin/handover/manual/${orderNumber}`),
        cancelRequest(orderId),
      ]);
      await deliver();

      const handedWon = handed.status === 201;
      const cancelWon = cancelled.status === 204;
      expect([handedWon, cancelWon].filter(Boolean)).toHaveLength(1);
      const state = await orderState(orderId);
      const attestations = await ctx.prisma.orderHandover.count({ where: { orderId } });
      const fulfilledFacts = await ctx.prisma.outboxMessage.count({
        where: { type: "order.fulfilled" },
      });
      if (cancelWon) {
        expect(handed.status).toBe(409);
        expect(jsonBody<{ readonly message: string }>(handed).message).toContain(
          "vient d'être annulée",
        );
        expect(state.status).toBe(OrderStatus.cancelled);
        expect(attestations).toBe(0);
        expect(fulfilledFacts).toBe(0);
      } else {
        expect(cancelled.status).toBe(409);
        expect(codeOf(cancelled)).toBe("orders.cancel.fulfilled");
        expect(state.status).toBe(OrderStatus.fulfilled);
        expect(attestations).toBe(1);
        expect(fulfilledFacts).toBe(1);
      }
    },
  );

  it("annulée AVANT : la remise est refusée en 409 et n'atteste rien", async () => {
    const { orderId, orderNumber } = await seedOrder({ payment: PaymentStatus.paid });
    expect((await cancelRequest(orderId)).status).toBe(204);

    const handed = await ctx.asSub(E2E_STAFF_SUB).post(`/admin/handover/manual/${orderNumber}`);

    expect(handed.status).toBe(409);
    expect(await ctx.prisma.orderHandover.count({ where: { orderId } })).toBe(0);
  });
});

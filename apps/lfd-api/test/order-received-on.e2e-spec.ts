/**
 * **La date de réception part avec la remise** (plan
 * `documentation/commandes/la-commande/date-de-reception.md`, B2, option A).
 *
 * Ce que seul le vrai Postgres prouve :
 *
 * - le commerce pose `received_on` dans la même écriture que `handed_over_at` —
 *   seul écrivain de la colonne depuis le retrait de l'abonné du lot ZL (B4) ;
 * - Q2 (Hugo, 2026-10-24) : à la porte, l'arrêt est clos et la preuve écrite
 *   AVANT que le fait de retrait ne parte — le jour posé est celui de la
 *   tournée, pas celui de l'attestation ;
 * - B4 (Q5) : la base refuse une remise sans date ET une date sans remise ;
 * - le module démarre : la commande du commerce lit les canaux du retrait et
 *   de la livraison sans injection circulaire (objection 7 de `vitruve`).
 */
import { instantToLocal } from "@lfd/contracts";

import { CommandBus } from "@nestjs/cqrs";

import { ConfirmOrderPaymentCommand } from "../src/b2b/orders/application/commands/confirm-order-payment.command.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { staffWithRole } from "./delivery-driver-scene.js";
import { DOOR_DAY, DOOR_ROLE, departedStop, JPEG, myRound } from "./delivery-handover-scene.js";
import { MY_ROUND } from "./delivery-driver-scene.js";
import { ADMIN_VERIFIER_OVERRIDE, forgetCustomer } from "./delivery-rounds-scene.js";
import { forgetRoutingScene } from "./delivery-routing-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { pickupSite, placeOrder } from "./order-factory.js";

let ctx: E2eContext;
let sequence = 0;

/** L'intention que la prochaine passation recevra. */
let nextIntent = "pi_e2e";
const fakeGateway = {
  createIntent: () =>
    Promise.resolve({ paymentIntentId: nextIntent, clientSecret: `${nextIntent}_secret` }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, { token: PaymentGateway, value: fakeGateway }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  forgetCustomer();
  forgetRoutingScene();
  await ctx.asSub(E2E_STAFF_SUB).post("/admin/staff-roles").send(DOOR_ROLE).expect(201);
});

/** Une commande de comptoir, carte déjà encaissée, passée par le vrai chemin (plan T). */
async function readyOrder(): Promise<{ readonly id: string; readonly number: string }> {
  sequence += 1;
  const user = await createUser(ctx.prisma, { auth0Sub: `auth0|recue-${String(sequence)}` });
  nextIntent = `pi_recue_${String(sequence)}`;
  const order = await placeOrder(ctx, {
    buyerUserId: user.id,
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
  });
  await ctx.app.get(CommandBus).execute(new ConfirmOrderPaymentCommand(nextIntent, "succeeded"));
  await ctx.drain();
  return { id: order.id, number: order.orderNumber };
}

async function received(orderId: string) {
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { receivedOn: true, handedOverAt: true, status: true },
  });
  return {
    receivedOn: row.receivedOn?.toISOString().slice(0, 10) ?? null,
    handedOverDay: row.handedOverAt === null ? null : instantToLocal(row.handedOverAt).day,
    status: row.status,
  };
}

describe("la date de réception part avec la remise", () => {
  /**
   * Régression (2026-10-24) : une commande remise restait sans date de
   * réception quand l'abonné ne passait pas — 21 en dev, hors de toute facture.
   */
  it("une commande remise restait sans date de réception quand l'abonné ne passait pas", async () => {
    const order = await readyOrder();

    await ctx.asSub(E2E_STAFF_SUB).post(`/admin/handover/manual/${order.number}`).expect(201);
    await ctx.drain();

    const state = await received(order.id);
    expect(state.status).toBe("fulfilled");
    expect(state.receivedOn).not.toBeNull();
    expect(state.receivedOn).toBe(state.handedOverDay);
  });

  it("Q2 — à la porte : l'arrêt clos et la preuve sont lus, le jour est celui de la tournée", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orderId, stopId } = await departedStop(ctx, paul);
    const version = (await myRound(paul.agent, roundId)).version;

    await paul.agent
      .post(`${MY_ROUND}/${roundId}/stops/${stopId}/handover`)
      .field("version", String(version))
      .field("receiverName", "Mme Durand")
      .attach("photo", JPEG, "remise.jpg")
      .expect(204);
    await ctx.drain();

    const state = await received(orderId);
    // La tournée roule dans une semaine : un repli sur le jour de
    // l'attestation se verrait.
    expect(state.handedOverDay).not.toBe(DOOR_DAY);
    expect(state.status).toBe("fulfilled");
    expect(state.receivedOn).toBe(DOOR_DAY);
  });

  it("B4 — la base refuse une remise sans date de réception", async () => {
    const order = await readyOrder();

    await expect(
      ctx.prisma.order.update({ where: { id: order.id }, data: { handedOverAt: new Date() } }),
    ).rejects.toThrow(/orders_handover_has_received_on/u);
  });

  it("B4 — la base refuse une date de réception sans remise", async () => {
    const order = await readyOrder();

    await expect(
      ctx.prisma.order.update({
        where: { id: order.id },
        data: { receivedOn: new Date("2026-01-02T00:00:00.000Z") },
      }),
    ).rejects.toThrow(/orders_received_on_has_handover/u);
    expect((await received(order.id)).receivedOn).toBeNull();
  });
});

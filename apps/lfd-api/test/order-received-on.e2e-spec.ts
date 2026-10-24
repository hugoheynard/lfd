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

import {
  OrderClientele,
  OrderStatus,
  PaymentStatus,
} from "../src/platform/database/client/client.js";
import { staffWithRole } from "./delivery-driver-scene.js";
import { DOOR_DAY, DOOR_ROLE, departedStop, JPEG, myRound } from "./delivery-handover-scene.js";
import { MY_ROUND } from "./delivery-driver-scene.js";
import { ADMIN_VERIFIER_OVERRIDE, forgetCustomer } from "./delivery-rounds-scene.js";
import { forgetRoutingScene } from "./delivery-routing-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";

let ctx: E2eContext;
let sequence = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE],
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

/** Une commande prête au comptoir, carte déjà encaissée — la scène de `handover-durable`. */
async function readyOrder(): Promise<{ readonly id: string; readonly number: string }> {
  sequence += 1;
  const number = `CMD-RECUE-${String(sequence)}`;
  const user = await createUser(ctx.prisma, { auth0Sub: `auth0|recue-${String(sequence)}` });
  const order = await ctx.prisma.order.create({
    data: {
      orderNumber: number,
      placedByUserId: user.id,
      clientele: OrderClientele.public,
      status: OrderStatus.ready,
      subtotalCents: 2_340,
      totalCents: 2_340,
      paymentStatus: PaymentStatus.paid,
      stripePaymentIntentId: `pi_recue_${String(sequence)}`,
    },
    select: { id: true },
  });
  return { id: order.id, number };
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

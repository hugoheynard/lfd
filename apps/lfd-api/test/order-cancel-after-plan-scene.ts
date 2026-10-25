import type request from "supertest";

import {
  PaymentRefunder,
  type RefundIssuance,
  type RefundLookup,
} from "../src/b2b/payments/domain/payment-refunder.js";
import { E2E_STAFF_SUB, jsonBody, type E2eContext, type E2eOverride } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { pickupSite, placeOrder } from "./order-factory.js";
import { settleCardPayments } from "./card-payments.js";
import {
  bootstrapProductionDay,
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
} from "./production-day-fixture.js";

/**
 * **La scène du retrait d'une commande inscrite** (plan A1,
 * `documentation/commandes/annulation/plan-a1-retirer-une-commande-inscrite.md`,
 * lot A1.2) — la journée de fournil des suites de production, plus un Stripe
 * de remboursement qui ne répond pas : la demande reste écrite, et c'est elle
 * qu'on regarde (« remboursement demandé »), pas l'argent parti.
 *
 * Tout le reste est réel : la passation par le bus, l'arrêt du plan, la liste
 * à coliser, le poste, l'annulation par ses deux routes.
 */

/** Stripe hors scène : l'exécuteur laisse la demande en attente, rien n'est émis. */
class SilentRefunder extends PaymentRefunder {
  refundRemainder(): Promise<RefundIssuance> {
    return Promise.resolve({ kind: "unavailable", reason: "e2e : Stripe hors scène" });
  }

  findRefund(): Promise<RefundLookup> {
    return Promise.resolve({ kind: "none" });
  }
}

export async function bootAfterPlanScene(
  extra: readonly E2eOverride[] = [],
): Promise<{ ctx: E2eContext; issued: string[] }> {
  return bootstrapProductionDay([
    { token: PaymentRefunder, value: new SilentRefunder() },
    ...extra,
  ]);
}

/** Le réglage « Jusqu'où un particulier peut-il annuler ? », délai coupé. */
export async function setStage(ctx: E2eContext, stage: "production_plan" | "ready"): Promise<void> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .patch("/admin/customer-cancellation")
    .send({ delayEnabled: false, b2cCancellableUntil: stage })
    .expect(204);
}

/** Une commande de RETRAIT d'un particulier, payée par carte, pour la journée servie. */
export async function personalPickup(
  ctx: E2eContext,
  issued: string[],
  quantity = 3,
): Promise<{ readonly id: string; readonly reference: string }> {
  const buyer =
    (await ctx.prisma.user.findFirst({ where: { auth0Sub: MEMBER }, select: { id: true } })) ??
    (await createUser(ctx.prisma, { auth0Sub: MEMBER }));
  const placed = await placeOrder(ctx, {
    buyerUserId: buyer.id,
    forDay: SERVICE_DAY,
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    lines: [{ sku: CROISSANT, quantity }],
  });
  await settleCardPayments(ctx, issued);
  return { id: placed.id, reference: placed.orderNumber };
}

/** `POST /admin/orders/:id/cancel` sous le staff de la scène. */
export function staffCancel(ctx: E2eContext, orderId: string): request.Test {
  return ctx
    .asSub(E2E_STAFF_SUB)
    .post(`/admin/orders/${orderId}/cancel`)
    .send({ reason: "Le client a rappelé : il ne viendra pas" });
}

/** `POST /orders/:id/cancel` sous le `sub` du particulier. */
export function customerCancel(ctx: E2eContext, orderId: string): request.Test {
  return ctx.asSub(MEMBER).post(`/orders/${orderId}/cancel`).send({});
}

export const codeOf = (response: request.Response): string =>
  jsonBody<{ readonly code: string }>(response).code;

/** La feuille du colisage telle que la base la porte — même une pierre tombale. */
export function packingRowOf(ctx: E2eContext, orderId: string) {
  return ctx.prisma.packingOrder.findUnique({
    where: { serviceDay_orderId: { serviceDay: SERVICE_DAY, orderId } },
    select: {
      withdrawnAt: true,
      packedAt: true,
      lines: { select: { sku: true } },
      containers: { select: { voidedAt: true } },
    },
  });
}

/** La réserve du croissant ce jour-là. */
export function croissantStock(ctx: E2eContext) {
  return ctx.prisma.packingStock.findUnique({
    where: { serviceDay_sku: { serviceDay: SERVICE_DAY, sku: CROISSANT } },
    select: { received: true, returned: true, packed: true },
  });
}

/** Le compte à produire : la commande reste-t-elle inscrite au fournil ? */
export function inscriptionsOf(ctx: E2eContext, orderId: string): Promise<number> {
  return ctx.prisma.productionOrder.count({ where: { serviceDay: SERVICE_DAY, orderId } });
}

export function withdrawalOf(ctx: E2eContext, orderId: string) {
  return ctx.prisma.orderWithdrawal.findUnique({
    where: { orderId },
    select: { afterInscription: true },
  });
}

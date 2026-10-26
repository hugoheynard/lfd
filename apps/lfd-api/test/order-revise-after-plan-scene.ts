/**
 * **La scène de la révision après l'arrêt** (plan A2,
 * `documentation/commandes/modification/plan-a2-modifier-une-commande-inscrite.md`,
 * § 7) — une commande au compte inscrite au plan (la scène du départ
 * incomplet), et ce que la base en dit : le dû au fournil, le compte du jour,
 * la feuille du colisage, le BL prévu.
 */
import type request from "supertest";

import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { pickupSite } from "./order-factory.js";
import { CROISSANT, SERVICE_DAY, STAFF } from "./production-day-fixture.js";

/** `POST /admin/orders/:id/revisions` : la commande telle que passée, aux croissants près. */
export async function reviseQuantity(
  ctx: E2eContext,
  orderId: string,
  quantity: number,
  over: Record<string, unknown> = {},
): Promise<request.Response> {
  const { revision } = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { revision: true },
  });
  return ctx
    .asSub(STAFF)
    .post(`/admin/orders/${orderId}/revisions`)
    .send({
      expectedRevision: revision,
      requestedDeliveryDate: SERVICE_DAY,
      fulfillmentMethod: "pickup",
      pickupAddressId: await pickupSite(ctx.prisma),
      requestedWindow: { start: "07:00", end: "08:00" },
      note: "",
      lines: [{ sku: CROISSANT, quantity }],
      ...over,
    });
}

export const codeOf = (response: request.Response): string =>
  jsonBody<{ readonly code: string }>(response).code;

/** Le dû de la commande au fournil, pour le croissant. */
export async function bakeryDueOf(ctx: E2eContext, orderId: string): Promise<number | undefined> {
  const line = await ctx.prisma.productionOrderLine.findFirst({
    where: { sku: CROISSANT, order: { orderId, serviceDay: SERVICE_DAY } },
    select: { quantity: true },
  });
  return line?.quantity;
}

/** Le compte du jour pour le croissant — ce qui est demandé au four. */
export async function ovenCount(ctx: E2eContext): Promise<number | undefined> {
  const row = await ctx.prisma.productionCount.findFirst({
    where: { serviceDay: SERVICE_DAY, sku: CROISSANT },
    select: { quantity: true },
  });
  return row?.quantity;
}

/** La ligne due de la feuille du colisage, pour le croissant. */
export async function packingDueOf(ctx: E2eContext, orderId: string): Promise<number | undefined> {
  const line = await ctx.prisma.packingLine.findUnique({
    where: {
      serviceDay_orderId_rank_sku: { serviceDay: SERVICE_DAY, orderId, rank: 1, sku: CROISSANT },
    },
    select: { quantity: true },
  });
  return line?.quantity;
}

/** Le BL vivant de la commande : statut, version, quantité du croissant. */
export async function liveNoteOf(ctx: E2eContext, orderId: string) {
  const note = await ctx.prisma.deliveryNote.findFirst({
    where: { orderId, status: { not: "voided" } },
    select: {
      status: true,
      contentVersion: true,
      lines: { where: { sku: CROISSANT }, select: { quantity: true } },
    },
  });
  return note === null
    ? null
    : {
        status: note.status,
        contentVersion: note.contentVersion,
        quantity: note.lines[0]?.quantity,
      };
}

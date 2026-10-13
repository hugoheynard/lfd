import { randomUUID } from "node:crypto";

import type { AdminOrderView, PlacedOrderResponse } from "@lfd/contracts";
import { CommandBus } from "@nestjs/cqrs";
import type request from "supertest";

import { ConvertLoyaltyPointsCommand } from "../src/b2b/loyalty/application/commands/convert-loyalty-points.command.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { Clock } from "../src/platform/time/clock.js";
import { E2E_STAFF_SUB, jsonBody } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { bootScene, context, DAY } from "./order-staff-cancel-scene.js";

/**
 * **La scène du bon à l'annulation** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, lot C3b) — partagée
 * par la suite des gestes et celle des courses.
 *
 * Tout passe par les vrais gestes : le réglage et l'ajustement par HTTP, la
 * conversion par le bus, la passation par `POST /orders`. Le reliquat naît
 * donc comme en production — à la passation d'un total nul.
 *
 * L'horloge est figée sur MAINTENANT au démarrage et ne bouge que par un
 * décalage relatif (« plus d'un an après ») : aucune date absolue.
 */

export const CLIENT = "auth0|refusion-fidele";
export const clock = new FixedClock(new Date());

/** Un palier = 1 000 points = 5,00 € HT ; un bon vit 365 jours. */
const SETTINGS = {
  pointsPerStep: 1_000,
  stepValueCents: 500,
  openToPublic: true,
  openToPro: false,
  voucherValidityDays: 365,
  welcomeBonusPoints: null,
};

export const bootVoucherScene = () => bootScene([{ token: Clock, value: clock }]);

let pickupId: string | null = null;

/** Le programme ouvert, un point de retrait, et la cliente créditée de `points`. */
export async function fidelity(points = 3_000): Promise<string> {
  const ctx = context();
  clock.set(new Date());
  const point = await ctx.prisma.pickupAddress.create({
    data: {
      label: "Le Labo",
      ligne1: "Route de la Balme",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  pickupId = point.id;
  await ctx
    .asSub(E2E_STAFF_SUB)
    .put("/admin/accounting/loyalty/settings")
    .send(SETTINGS)
    .expect(204);
  const user = await createUser(ctx.prisma, { auth0Sub: CLIENT, firstName: "Léa" });
  await ctx
    .asSub(E2E_STAFF_SUB)
    .post("/admin/accounting/loyalty/adjustments")
    .send({ holderKind: "user", holderId: user.id, points, reason: "reprise" })
    .expect(204);
  return user.id;
}

/** Un bon de `steps` paliers, par la vraie conversion. */
export function convert(userId: string, steps = 1): Promise<string> {
  return context()
    .app.get(CommandBus)
    .execute<ConvertLoyaltyPointsCommand, string>(
      new ConvertLoyaltyPointsCommand("user", userId, userId, steps, null),
    );
}

/** `POST /orders` : `quantity` croissants à 2,00 € HT, avec le bon. */
export function place(voucherId: string, quantity: number): request.Test {
  if (pickupId === null) {
    throw new Error("fidelity() d'abord");
  }
  return context()
    .asSub(CLIENT)
    .post("/orders")
    .send({
      idempotencyKey: randomUUID(),
      fulfillmentMethod: "pickup",
      pickupAddressId: pickupId,
      requestedDeliveryDate: DAY,
      note: "",
      lines: [{ sku: "VIE-001", quantity }],
      voucherId,
    });
}

/** Une passation acceptée : l'identifiant et le numéro de la commande. */
export async function placed(
  voucherId: string,
  quantity: number,
): Promise<{ readonly id: string; readonly number: string }> {
  const response = await place(voucherId, quantity).expect(201);
  const id = jsonBody<PlacedOrderResponse>(response).id;
  const row = await context().prisma.order.findUniqueOrThrow({
    where: { id },
    select: { orderNumber: true },
  });
  return { id, number: row.orderNumber };
}

export const voucherRow = (id: string) =>
  context().prisma.loyaltyVoucher.findUniqueOrThrow({ where: { id } });

/** Le reliquat NON refondu d'un bon, ou `null`. */
export async function liveRemainderOf(parentId: string) {
  return context().prisma.loyaltyVoucher.findFirst({
    where: { parentVoucherId: parentId, status: { not: "merged_back" } },
  });
}

/** Le reliquat vivant d'un bon, qui DOIT exister. */
export async function remainderOf(parentId: string): Promise<string> {
  const found = await liveRemainderOf(parentId);
  if (found === null) {
    throw new Error(`le bon ${parentId} aurait dû laisser un reliquat`);
  }
  return found.id;
}

/** Le solde de points, somme du grand livre. */
export async function balanceOf(userId: string): Promise<number> {
  const sum = await context().prisma.loyaltyLedgerEntry.aggregate({
    where: { userId },
    _sum: { points: true },
  });
  return sum._sum.points ?? 0;
}

/** L'aperçu du détail staff. */
export async function cancellabilityOf(orderId: string): Promise<AdminOrderView["cancellability"]> {
  const response = await context().asSub(E2E_STAFF_SUB).get(`/admin/orders/${orderId}`).expect(200);
  return jsonBody<AdminOrderView>(response).cancellability;
}

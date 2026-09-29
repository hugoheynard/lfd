/**
 * Les fixtures partagées par les deux suites e2e de la **composition des
 * tournées** : le parcours (`delivery-rounds.e2e-spec.ts`) et les gardes
 * (`delivery-rounds-guards.e2e-spec.ts`) — plan de tournée, lot 3.
 *
 * Rien ici ne boote l'application. Les commandes sont semées par Prisma, comme
 * `day-supervision.e2e-spec.ts` : la composition ne lit d'une commande que son
 * jour, son mode et son statut, et la passer par la boutique ne prouverait
 * rien de plus sur ce lot.
 */
import type { CreatedIdResponse, DeliveryRoundsDayView, DeliveryRoundView } from "@lfd/contracts";
import type request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";

export const ROUNDS = "/admin/livraison/tournees";
export const VEHICLES = "/admin/livraison/vehicules";

/** Le jeton porteur EST le `sub` : chaque rôle est une vraie fiche en base. */
export const ADMIN_VERIFIER_OVERRIDE = {
  token: AdminTokenVerifier,
  value: {
    verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
      Promise.resolve({ subject: token, scopes: [] }),
  },
};

export function admin(ctx: E2eContext): request.Agent {
  return ctx.asSub(E2E_STAFF_SUB);
}

let plateSeq = 0;

/** Un véhicule, par la route de la flotte. */
export async function addVehicle(ctx: E2eContext, name: string): Promise<string> {
  plateSeq += 1;
  const plate = `AB-${String(100 + plateSeq)}-CD`;
  const response = await admin(ctx).post(VEHICLES).send({ name, plate }).expect(201);
  return jsonBody<CreatedIdResponse>(response).id;
}

let orderSeq = 0;
let customerId: string | null = null;

/** Oublie le client semé : `ctx.reset()` l'a effacé. */
export function forgetCustomer(): void {
  customerId = null;
}

/** Une commande en livraison pour ce jour ; rend son id et son numéro. */
export async function seedDelivery(
  ctx: E2eContext,
  day: string,
): Promise<{ readonly id: string; readonly reference: string }> {
  if (customerId === null) {
    customerId = (await createUser(ctx.prisma, { auth0Sub: "auth0|rounds", email: "r@col.fr" })).id;
  }
  orderSeq += 1;
  const reference = `LIV-${String(orderSeq).padStart(4, "0")}`;
  const order = await ctx.prisma.order.create({
    data: {
      orderNumber: reference,
      placedByUserId: customerId,
      clientele: "pro",
      status: "placed",
      paymentStatus: "not_required",
      // La clé de journée du commerce : minuit UTC, comme `expectedOnWhere`.
      requestedDeliveryDate: new Date(`${day}T00:00:00.000Z`),
      fulfillmentMethod: "delivery",
      subtotalCents: 1000,
      totalCents: 1200,
    },
    select: { id: true },
  });
  return { id: order.id, reference };
}

export async function openRound(ctx: E2eContext, day: string, vehicleId: string): Promise<string> {
  const response = await admin(ctx).post(ROUNDS).send({ day, vehicleId }).expect(201);
  return jsonBody<CreatedIdResponse>(response).id;
}

export async function dayView(ctx: E2eContext, day: string): Promise<DeliveryRoundsDayView> {
  return jsonBody<DeliveryRoundsDayView>(await admin(ctx).get(`${ROUNDS}?jour=${day}`).expect(200));
}

export async function roundOf(
  ctx: E2eContext,
  day: string,
  roundId: string,
): Promise<DeliveryRoundView> {
  const found = (await dayView(ctx, day)).rounds.find((round) => round.id === roundId);
  if (found === undefined) {
    throw new TypeError(`tournée ${roundId} absente du ${day}`);
  }
  return found;
}

/** Affecte à la version courante ; rend l'arrêt. */
export async function assign(
  ctx: E2eContext,
  day: string,
  roundId: string,
  orderId: string,
): Promise<string> {
  const { version } = await roundOf(ctx, day, roundId);
  const response = await admin(ctx)
    .post(`${ROUNDS}/${roundId}/arrets`)
    .send({ orderId, version })
    .expect(201);
  return jsonBody<{ stopId: string }>(response).stopId;
}

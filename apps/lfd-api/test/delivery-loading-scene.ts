/**
 * Les fixtures partagées par les deux suites e2e du **chargement** (plan de
 * tournée, lot 4) : le parcours (`delivery-loading.e2e-spec.ts`) et les gardes
 * (`delivery-loading-guards.e2e-spec.ts`). Elles s'appuient sur celles de la
 * composition (`delivery-rounds-scene.ts`) : on ne charge que ce qu'on a
 * composé.
 */
import type { DeliveryLoadingRoundView, DeliveryOrderBagsView } from "@lfd/contracts";
import type request from "supertest";

import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { addVehicle, admin, assign, openRound, seedDelivery } from "./delivery-rounds-scene.js";

export const LOADING = "/admin/livraison";

/** Déclare `count` sacs ; rend leurs identifiants. */
export async function declareBags(
  ctx: E2eContext,
  orderId: string,
  count: number,
): Promise<readonly string[]> {
  const response = await admin(ctx).post(`${LOADING}/sacs`).send({ orderId, count }).expect(201);
  return jsonBody<{ bagIds: string[] }>(response).bagIds;
}

export async function orderBags(ctx: E2eContext, orderId: string): Promise<DeliveryOrderBagsView> {
  return jsonBody<DeliveryOrderBagsView>(
    await admin(ctx).get(`${LOADING}/sacs?commande=${orderId}`).expect(200),
  );
}

export async function loadingOf(
  ctx: E2eContext,
  roundId: string,
): Promise<DeliveryLoadingRoundView> {
  return jsonBody<DeliveryLoadingRoundView>(
    await admin(ctx).get(`${LOADING}/chargement/${roundId}`).expect(200),
  );
}

/** Charge un sac ; rend la réponse pour que le test choisisse son statut. */
export function loadBag(
  ctx: E2eContext,
  roundId: string,
  body: { readonly bagId: string } | { readonly code: string },
): request.Test {
  return admin(ctx).post(`${LOADING}/chargement/${roundId}/sacs`).send(body);
}

/** « Partir » à la version courante de la tournée. */
export async function depart(ctx: E2eContext, roundId: string): Promise<request.Response> {
  const { version } = await loadingOf(ctx, roundId);
  return admin(ctx).post(`${LOADING}/tournees/${roundId}/depart`).send({ version });
}

/** Une tournée d'un véhicule, et une commande composée dedans. */
export async function composedOrder(
  ctx: E2eContext,
  day: string,
  vehicleName: string,
): Promise<{
  readonly roundId: string;
  readonly stopId: string;
  readonly order: { readonly id: string; readonly reference: string };
}> {
  const roundId = await openRound(ctx, day, await addVehicle(ctx, vehicleName));
  const order = await seedDelivery(ctx, day);
  const stopId = await assign(ctx, day, roundId, order.id);
  return { roundId, stopId, order };
}

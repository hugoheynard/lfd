/**
 * Les fixtures partagées par les deux suites e2e du **chargement** (plan de
 * tournée, lot 4) : le parcours (`delivery-loading.e2e-spec.ts`) et les gardes
 * (`delivery-loading-guards.e2e-spec.ts`). Elles s'appuient sur celles de la
 * composition (`delivery-rounds-scene.ts`) : on ne charge que ce qu'on a
 * composé.
 */
import type {
  BinTypesView,
  DeclareDeliveryBinsPayload,
  DeliveryLoadingRoundView,
  DeliveryOrderBinsView,
} from "@lfd/contracts";
import type request from "supertest";

import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { addVehicle, admin, assign, openRound, seedDelivery } from "./delivery-rounds-scene.js";

export const LOADING = "/admin/livraison";

/** Les bacs déclarés d'une commande : le colisage, pas le catalogue des types. */
export const BINS = `${LOADING}/colisage/bacs`;

/** Le type de bac cloisonnable des suites, créé au premier besoin (la base est remise à zéro par suite). */
export const E2E_BIN_TYPE = "Bac M e2e";

/**
 * Un type du catalogue, par son nom : relu s'il existe, ajouté sinon — par la
 * vraie route du catalogue (tranche A), jamais en Prisma.
 */
export async function binTypeId(
  ctx: E2eContext,
  name: string = E2E_BIN_TYPE,
  options: { readonly divisible?: boolean } = {},
): Promise<string> {
  const { types } = jsonBody<BinTypesView>(await admin(ctx).get(`${LOADING}/bacs`).expect(200));
  const found = types.find((binType) => binType.name === name && binType.archivedAt === null);
  if (found !== undefined) {
    return found.id;
  }
  const response = await admin(ctx)
    .post(`${LOADING}/bacs`)
    .send({
      name,
      outer: { lengthCm: 60, widthCm: 40, heightCm: 22 },
      inner: { lengthCm: 57, widthCm: 37, heightCm: 20 },
      isotherm: false,
      maxStack: 5,
      divisible: options.divisible ?? true,
    })
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

/** Déclare `count` bacs ENTIERS du type des suites ; rend leurs identifiants. */
export async function declareBins(
  ctx: E2eContext,
  orderId: string,
  count: number,
): Promise<readonly string[]> {
  return declareTypedBins(ctx, { orderId, whole: count, half: false, innerBags: 0 });
}

/** Déclare des bacs typés ; le type par défaut est celui des suites. */
export async function declareTypedBins(
  ctx: E2eContext,
  payload: Omit<DeclareDeliveryBinsPayload, "binTypeId"> & { readonly binTypeId?: string },
): Promise<readonly string[]> {
  const response = await admin(ctx)
    .post(BINS)
    .send({ ...payload, binTypeId: payload.binTypeId ?? (await binTypeId(ctx)) })
    .expect(201);
  return jsonBody<{ binIds: string[] }>(response).binIds;
}

export async function orderBins(ctx: E2eContext, orderId: string): Promise<DeliveryOrderBinsView> {
  return jsonBody<DeliveryOrderBinsView>(
    await admin(ctx).get(`${BINS}?commande=${orderId}`).expect(200),
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

/** Charge un bac ; rend la réponse pour que le test choisisse son statut. */
export function loadBin(
  ctx: E2eContext,
  roundId: string,
  body: { readonly binId: string } | { readonly code: string },
): request.Test {
  return admin(ctx).post(`${LOADING}/chargement/${roundId}/bacs`).send(body);
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

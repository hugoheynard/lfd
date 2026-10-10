/**
 * Les fixtures partagées par les suites e2e du **chargement**, du **départ** et
 * de la **porte** (plan de tournée, lot 4, et toutes celles qui passent par
 * `delivery-handover-scene.ts`). Elles s'appuient sur celles de la composition
 * (`delivery-rounds-scene.ts`) : on ne charge que ce qu'on a composé.
 *
 * 🔴 **Elles ne colisent pas : elles POSENT des bacs** (voie (b) de
 * `documentation/colisage/colisage.md` §9, tranchée par Hugo le 2026-10-10).
 * Les routes de déclaration de la livraison sont retirées ; un bac naît par
 * `BinDesk`, le port que le colisage déclare et que la livraison implémente —
 * celui-là même qu'appelle le poste. Ces suites sèment leurs commandes sur des
 * jours libres, que le colisage ne connaît pas (il ne voit une commande
 * qu'après la clôture du fournil) : ce qu'elles éprouvent, c'est le
 * chargement, le départ et la porte. Le colisage, lui, est éprouvé par ses
 * propres suites (`packing-*.e2e-spec.ts`).
 */
import type { BinTypesView, DeliveryLoadingRoundView, DeliveryOrderBinsView } from "@lfd/contracts";
import type request from "supertest";

import { BinDesk, type DeskBin } from "../src/packing/channels/delivery/index.js";
import { newTraceId } from "../src/platform/context/trace-context.js";
import { runWithRequestContext } from "../src/platform/context/request-context.store.js";
import { Clock } from "../src/platform/time/clock.js";
import { E2E_STAFF_ID, jsonBody, type E2eContext } from "./e2e-harness.js";
import { addVehicle, admin, assign, openRound, seedDelivery } from "./delivery-rounds-scene.js";

export const LOADING = "/admin/livraison";

/** Les bacs déclarés d'une commande — les lire, en ouvrir la fiche, les annuler. */
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
      outer: { lengthMm: 600, widthMm: 400, heightMm: 220 },
      inner: { lengthMm: 570, widthMm: 370, heightMm: 200 },
      isotherm: false,
      maxStack: 5,
      divisible: options.divisible ?? true,
    })
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

/** Ce que pose `declareTypedBins` : `whole` bacs entiers, puis une moitié si `half`. */
export interface BinsToPlace {
  readonly orderId: string;
  readonly whole: number;
  readonly half: boolean;
  readonly innerBags: number;
  /** Le type des suites si absent. */
  readonly binTypeId?: string;
}

/**
 * Appelle `BinDesk` comme le ferait le poste : dans un contexte de requête dont
 * l'acteur est le staff des e2e, pour que le journal nomme quelqu'un. Le
 * guichet ouvre sa propre unité de travail — il rejoint celle de l'appelant
 * quand il y en a une, il en ouvre une sinon.
 */
function atTheDesk<T>(ctx: E2eContext, gesture: (desk: BinDesk) => Promise<T>): Promise<T> {
  const seed = {
    now: ctx.app.get(Clock).now(),
    traceId: newTraceId(),
    actor: { type: "staff", id: E2E_STAFF_ID },
  } as const;
  return runWithRequestContext(seed, () => gesture(ctx.app.get(BinDesk)));
}

/** Pose `count` bacs ENTIERS du type des suites ; rend leurs identifiants. */
export async function declareBins(
  ctx: E2eContext,
  orderId: string,
  count: number,
): Promise<readonly string[]> {
  return declareTypedBins(ctx, { orderId, whole: count, half: false, innerBags: 0 });
}

/**
 * Pose des bacs typés, un par un, par `BinDesk.declareBin` — les entiers, puis
 * la moitié. Un appel par bac, donc un fait `delivery_bin.declared` par bac :
 * c'est ce que fait le poste. Les refus remontent tels quels (`AppError`).
 */
export async function declareTypedBins(
  ctx: E2eContext,
  bins: BinsToPlace,
): Promise<readonly string[]> {
  const typeId = bins.binTypeId ?? (await binTypeId(ctx));
  const request = { orderId: bins.orderId, binTypeId: typeId, innerBags: bins.innerBags };
  const declared: DeskBin[] = [];
  for (let index = 0; index < bins.whole; index += 1) {
    declared.push(await atTheDesk(ctx, (desk) => desk.declareBin({ ...request, half: false })));
  }
  if (bins.half) {
    declared.push(await atTheDesk(ctx, (desk) => desk.declareBin({ ...request, half: true })));
  }
  return declared.map((bin) => bin.binId);
}

/** Pose l'autre moitié d'un bac partagé, par `BinDesk.shareHalf` ; rend son identifiant. */
export async function shareBin(
  ctx: E2eContext,
  orderId: string,
  partnerBinId: string,
  innerBags = 0,
): Promise<string> {
  const bin = await atTheDesk(ctx, (desk) => desk.shareHalf({ orderId, partnerBinId, innerBags }));
  return bin.binId;
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

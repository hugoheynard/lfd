/**
 * **La scène du transfert interne** (lots T1 à T3 —
 * `documentation/livraisons/transferts/plan-transfert-interne.md`) : Val
 * Village servi par transfert, un retrait réglé, la clôture qui le range, et
 * les gestes du chargement et du comptoir. Sortie de
 * `internal-transfer.e2e-spec.ts` au lot T3, pour que les bacs du transfert
 * aient leur propre suite.
 */
import type { DeclaredTransferBinsView, GpsPoint } from "@lfd/contracts";

import { RoadTravelTimeReader } from "../src/delivery/channels/commerce/index.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { binTypeId, LOADING } from "./delivery-loading-scene.js";
import { admin, addVehicle } from "./delivery-rounds-scene.js";
import { MEASURED, seedDeparture } from "./delivery-routing-scene.js";
import { createUser } from "./factories.js";

const VILLAGE_GPS = { lat: 45.45, lng: 6.98 };

/** Le trajet du transfert (T0), doublé : OSRM n'est pas lancé en e2e. */
export class FixedRoad extends RoadTravelTimeReader {
  minutesBetween(_from: GpsPoint, _to: GpsPoint): Promise<number | null> {
    return Promise.resolve(25);
  }
}

/** Val Village, servi par transfert, en mode dédié : aucune tournée de livraison à semer. */
export async function seedVillage(ctx: E2eContext): Promise<string> {
  const village = await ctx.prisma.site.create({
    data: {
      label: "Val Village",
      ligne1: "Route du Village",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      supply: "transfer",
      transferMode: "dedicated",
      counterSetupMinutes: 10,
      gps: VILLAGE_GPS,
      opening: { publicOpening: null, proPickup: { start: "07:30", end: "09:00" } },
    },
  });
  return village.id;
}

/**
 * Un retrait réglé au village pour le jour : trois pains. Écrit en Prisma,
 * comme les autres suites du fournil — le commerce n'a pas d'agrégat de ligne
 * hors d'une passation complète (dette de `test/factories.ts`).
 */
export async function seedVillageOrder(
  ctx: E2eContext,
  day: string,
  siteId: string,
): Promise<string> {
  const user = await createUser(ctx.prisma, { auth0Sub: "auth0|client", email: "c@vv.fr" });
  const order = await ctx.prisma.order.create({
    data: {
      orderNumber: "CMD-VV-1",
      placedByUserId: user.id,
      clientele: "public",
      status: "placed",
      paymentStatus: "not_required",
      requestedDeliveryDate: new Date(`${day}T00:00:00.000Z`),
      fulfillmentMethod: "pickup",
      pickupAddress: {
        label: "Val Village",
        siteId,
        ligne1: "Route du Village",
        ligne2: "",
        codePostal: "73150",
        ville: "Val d'Isère",
        pays: "France",
      },
      fulfillment: {
        window: { value: { start: "08:00", end: "10:00" }, source: "override" },
        contact: { value: null, source: "default" },
        signatureRequired: { value: false, source: "default" },
      },
      subtotalCents: 300,
      totalCents: 300,
      lines: {
        create: [
          {
            sku: "PAIN-VV",
            productNameSnapshot: "Pain du village",
            unitPriceMillicents: 100_000,
            quantity: 3,
            lineTotalCents: 300,
          },
        ],
      },
    },
  });
  return order.id;
}

/** Déclare `count` bacs entiers pour le transfert, au chargement (lot T3). */
export async function declareTransferBins(
  ctx: E2eContext,
  transferId: string,
  count: number,
): Promise<readonly string[]> {
  const response = await admin(ctx)
    .post(`${LOADING}/loading/transfers/${transferId}/bins`)
    .send({ binTypeId: await binTypeId(ctx), count, innerBags: 2 })
    .expect(201);
  return jsonBody<DeclaredTransferBinsView>(response).binIds;
}

export async function closePlan(ctx: E2eContext, day: string): Promise<void> {
  await admin(ctx).post(`/admin/production/batch/${day}/close`).expect(201);
  await ctx.drain();
}

export async function composedTransfer(
  ctx: E2eContext,
  day: string,
): Promise<{
  readonly orderId: string;
  readonly transferId: string;
}> {
  await seedDeparture(ctx);
  await addVehicle(ctx, "Kangoo", MEASURED);
  const orderId = await seedVillageOrder(ctx, day, await seedVillage(ctx));
  await closePlan(ctx, day);
  const transfer = await ctx.prisma.deliveryInternalTransfer.findFirstOrThrow({
    where: { serviceDay: day },
    select: { id: true },
  });
  return { orderId, transferId: transfer.id };
}

/** Une commande en retrait au comptoir, par son numéro (`CMD-VV-1`). */
export function handOverAtCounter(ctx: E2eContext) {
  return admin(ctx).post(`/admin/handover/manual/CMD-VV-1`);
}

export function receiveAtCounter(ctx: E2eContext, orderId: string, reason: string | null) {
  return admin(ctx).post(`/admin/handover/orders/${orderId}/transfer-reception`).send({ reason });
}

export function codeOf(response: Parameters<typeof jsonBody>[0]): string {
  return jsonBody<{ readonly code: string }>(response).code;
}

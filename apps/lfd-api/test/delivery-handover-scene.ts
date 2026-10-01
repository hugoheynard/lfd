/**
 * La scène des gestes qui remettent à la porte — « Remis au client » (B1) et
 * « Déposé avec preuve » (B2), `documentation/livraisons/plan-a-la-porte.md`.
 * Une tournée d'un arrêt chargé, affectée à un livreur, partie par lui ; le
 * rôle qui porte `delivery_doorstep`.
 *
 * Ce fichier n'est pas une suite (`.ts`, pas `.e2e-spec.ts`).
 */
import type { MyDeliveryRoundView } from "@lfd/contracts";
import type request from "supertest";

import { declareBins, loadBin } from "./delivery-loading-scene.js";
import { MY_ROUND } from "./delivery-driver-scene.js";
import { addVehicle, admin, assign, openRound, ROUNDS, roundOf } from "./delivery-rounds-scene.js";
import { seedLocatedDelivery } from "./delivery-routing-scene.js";
import { jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";

export const DOOR_DAY = serviceDay();
const POINT = { lat: 45.6, lng: 6.1 };
export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
export const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

export const DOOR_ROLE = {
  key: "livreur",
  label: "Livreur",
  grants: [
    { resource: "delivery_driving", action: "write" },
    { resource: "delivery_doorstep", action: "write" },
  ],
} as const;

export interface DoorDriver {
  readonly id: string;
  readonly agent: request.Agent;
}

export interface DepartedStop {
  readonly roundId: string;
  readonly orderId: string;
  readonly stopId: string;
}

export async function myRound(agent: request.Agent, roundId: string): Promise<MyDeliveryRoundView> {
  return jsonBody<MyDeliveryRoundView>(await agent.get(`${MY_ROUND}/${roundId}`).expect(200));
}

/** Une tournée d'un arrêt chargé, affectée à `driver`, partie par lui. */
/**
 * `beforeDeparture` : ce qui se règle juste avant « Commencer ma tournée » —
 * ce que le départ figera (B3 bis : la règle d'avance à la porte).
 */
export async function departedStop(
  ctx: E2eContext,
  driver: DoorDriver,
  beforeDeparture: (orderId: string) => Promise<void> = () => Promise.resolve(),
): Promise<DepartedStop> {
  const roundId = await openRound(ctx, DOOR_DAY, await addVehicle(ctx, "Kangoo"));
  const orderId = await seedLocatedDelivery(ctx, DOOR_DAY, POINT);
  await assign(ctx, DOOR_DAY, roundId, orderId);
  const bins = await declareBins(ctx, orderId, 1);
  await loadBin(ctx, roundId, { binId: bins[0] ?? "" }).expect(204);
  const { version } = await roundOf(ctx, DOOR_DAY, roundId);
  await admin(ctx)
    .put(`${ROUNDS}/${roundId}/livreur`)
    .send({ staffUserId: driver.id, version })
    .expect(204);
  await beforeDeparture(orderId);
  await driver.agent
    .post(`${MY_ROUND}/${roundId}/depart`)
    .send({ version: (await myRound(driver.agent, roundId)).version })
    .expect(204);
  const stop = await ctx.prisma.deliveryRoundStop.findFirstOrThrow({
    where: { orderId },
    select: { id: true },
  });
  return { roundId, orderId, stopId: stop.id };
}

export async function orderStatus(ctx: E2eContext, orderId: string): Promise<string> {
  const order = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true },
  });
  return order.status;
}

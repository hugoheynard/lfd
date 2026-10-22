/**
 * E2E du **parcours « au plus tôt » du Village**, d'un seul tenant : le
 * réassort du jour même d'un point servi par transfert, du lancement au
 * fournil jusqu'à la réception au comptoir (R4a–R4c de
 * `documentation/reassort-boutiques/plan-au-plus-tot.md`).
 *
 * Chaque maillon a sa suite (`resupply-launch`, `resupply-asap-packing`,
 * `resupply-asap-transfer`, `resupply-transfer-reception`, `resupply-receipt`).
 * Ce qui ne s'éprouve qu'ici : qu'ils S'ENCHAÎNENT — le même fait part au
 * colisage et à la livraison, la tournée part avec l'emballé, le transfert
 * reçu dit le réassort arrivé — par les vraies routes et la vraie boîte
 * d'envoi, sans écriture de raccord. La journée n'a jamais été arrêtée : le
 * lancement l'ouvre (Q5), sans dossier (Q6).
 *
 * L'horloge est figée et SAUTE d'une étape à l'autre, le jour servi (dans
 * une semaine). Aucune date du calendrier.
 */
import type {
  InternalTransferManifestView,
  MyDeliveryRoundView,
  PackingResuppliesView,
  ResupplyReceiptView,
} from "@lfd/contracts";
import { localToInstant } from "@lfd/contracts";

import { RoadTravelTimeReader } from "../src/delivery/channels/commerce/index.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { MY_ROUND, seedDriverRole, staffWithRole } from "./delivery-driver-scene.js";
import { binTypeId, depart, loadBin } from "./delivery-loading-scene.js";
import { ADMIN_VERIFIER_OVERRIDE, addVehicle, ROUNDS, roundOf } from "./delivery-rounds-scene.js";
import { MEASURED, ROAD_ROUTING_OVERRIDES, seedDeparture } from "./delivery-routing-scene.js";
import { declareTransferBins, FixedRoad, seedVillage } from "./internal-transfer-scene.js";
import {
  bootstrapProductionDay,
  CROISSANT,
  recordBatch,
  SERVICE_DAY,
  STAFF,
} from "./production-day-fixture.js";
import { counterSent } from "./site-resupply-scene.js";

const ASKED = 8;
const PACKED = 7;
const BATCH = "01K6A0000000000000000000AF";
const clock = new FixedClock(new Date());
let ctx: E2eContext;

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay([
    { token: Clock, value: clock },
    { token: RoadTravelTimeReader, value: new FixedRoad() },
    ...ROAD_ROUTING_OVERRIDES,
    // Le jeton porteur EST le `sub` : le livreur est une autre fiche que le staff.
    ADMIN_VERIFIER_OVERRIDE,
  ]));
});

afterAll(async () => {
  await ctx.close();
});

/** L'instant de la maison `time` le jour servi, à l'heure de Paris. */
function at(time: string): Date {
  const instant = localToInstant(SERVICE_DAY, time);
  if (instant === null) {
    throw new TypeError(`heure locale inexistante : ${SERVICE_DAY} ${time}`);
  }
  return instant;
}

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await ctx.drain();
  }
}

const staff = () => ctx.asSub(STAFF);

interface Flow {
  readonly village: string;
  readonly resupplyId: string;
}

type Paul = Awaited<ReturnType<typeof staffWithRole>>;

/** J 07:00 — la flotte, le dépôt, et le Village qui envoie « au plus tôt ». */
async function stepCounterSends(): Promise<Flow> {
  clock.set(at("07:00"));
  await seedDeparture(ctx);
  await addVehicle(ctx, "Kangoo", MEASURED);
  await seedDriverRole(ctx);
  await binTypeId(ctx);
  const village = await seedVillage(ctx);
  const resupplyId = await counterSent(staff(), village, "asap", [
    { sku: CROISSANT, quantity: ASKED },
  ]);
  return { village, resupplyId };
}

/** J 07:05 — « Lancer » : la journée s'ouvre arrêtée, le colisage et la livraison suivent. */
async function stepLaunch(flow: Flow): Promise<string> {
  clock.set(at("07:05"));
  await staff()
    .post(`/admin/production/batch/${SERVICE_DAY}/resupplies/${flow.resupplyId}/launch`)
    .expect(204);
  await settle();

  expect(
    await ctx.prisma.productionDay.findUniqueOrThrow({
      where: { serviceDay: SERVICE_DAY },
      select: { closedAt: true },
    }),
  ).toEqual({ closedAt: at("07:05") });
  expect(await ctx.prisma.outboxMessage.count({ where: { type: "production.day_closed" } })).toBe(
    0,
  );
  const readiness = await ctx.prisma.deliveryDayReadiness.findUniqueOrThrow({
    where: { serviceDay: SERVICE_DAY },
    select: { closedAt: true },
  });
  expect(readiness.closedAt).toEqual(at("07:05"));
  const sheets = jsonBody<PackingResuppliesView>(
    await staff().get(`/admin/packing/${SERVICE_DAY}/resupplies`).expect(200),
  );
  expect(sheets.resupplies).toMatchObject([
    { resupplyId: flow.resupplyId, kind: "asap", status: "open" },
  ]);
  const item = await ctx.prisma.deliveryInternalTransferItem.findFirstOrThrow({
    where: { kind: "resupply", resupplyId: flow.resupplyId, detachedAt: null },
    select: { transferId: true },
  });
  return item.transferId;
}

/** J 08:00 — la fournée descend, 7 emballés sur 8, fiche close. */
async function stepPacking(flow: Flow): Promise<void> {
  clock.set(at("08:00"));
  expect(await recordBatch(ctx, BATCH, ASKED)).toBe(204);
  await settle();
  const sheet = `/admin/packing/${SERVICE_DAY}/resupplies/${flow.resupplyId}`;
  await staff().put(`${sheet}/lines/${CROISSANT}`).send({ quantity: PACKED }).expect(204);
  await staff().post(`${sheet}/close`).expect(204);
  await settle();
}

/** J 08:30 — placé d'office au lancement, chargé, parti avec l'emballé, confié à Paul. */
async function stepDeparture(transferId: string): Promise<{ roundId: string; paul: Paul }> {
  clock.set(at("08:30"));
  const stops = await ctx.prisma.deliveryRoundStop.findMany({
    where: { transferId, removedAt: null },
    select: { roundId: true },
  });
  expect(stops).toHaveLength(1);
  const roundId = stops[0]?.roundId ?? "";
  const paul = await staffWithRole(ctx, "staff-paul");
  const { version } = await roundOf(ctx, SERVICE_DAY, roundId);
  await staff()
    .put(`${ROUNDS}/${roundId}/driver`)
    .send({ staffUserId: paul.id, version })
    .expect(204);
  const [binId] = await declareTransferBins(ctx, transferId, 1);
  await loadBin(ctx, roundId, { binId: binId ?? "" }).expect(204);
  expect((await depart(ctx, roundId)).status).toBe(204);
  await settle();

  const manifest = jsonBody<InternalTransferManifestView>(
    await staff().get(`/admin/delivery/transfers/${transferId}/manifest`).expect(200),
  );
  expect(manifest.frozen).toBe(true);
  expect(manifest.resupplies.totals).toEqual([
    expect.objectContaining({ sku: CROISSANT, quantity: PACKED }),
  ]);
  return { roundId, paul };
}

/** J 09:00 — « Remis au site » : le réassort est arrivé, la cloche sonne au comptoir. */
async function stepSiteDrop(flow: Flow, roundId: string, paul: Paul): Promise<void> {
  clock.set(at("09:00"));
  const mine = jsonBody<MyDeliveryRoundView>(
    await paul.agent.get(`${MY_ROUND}/${roundId}`).expect(200),
  );
  const stopId = mine.transferStops?.[0]?.stopId ?? "";
  await paul.agent
    .post(`${MY_ROUND}/${roundId}/stops/${stopId}/site-drop`)
    .send({ version: mine.version })
    .expect(204);
  await settle();

  const resupply = await ctx.prisma.siteResupply.findUniqueOrThrow({
    where: { id: flow.resupplyId },
    select: { arrivedAt: true },
  });
  expect(resupply.arrivedAt).toEqual(at("09:00"));
  expect(await ctx.prisma.staffNotification.count({ where: { kind: "resupply.arrived" } })).toBe(1);
}

/** J 09:10 — le comptoir réceptionne l'emballé. */
async function stepReception(flow: Flow): Promise<void> {
  clock.set(at("09:10"));
  const path = `/admin/resupply-receipts/${flow.village}/${SERVICE_DAY}`;
  const before = jsonBody<ResupplyReceiptView>(await staff().get(path).expect(200));
  expect(before.receptions).toMatchObject([
    { resupplyId: flow.resupplyId, lines: [{ expectedQuantity: PACKED }] },
  ]);
  await staff()
    .post(`/admin/resupply-receipts/${flow.village}/resupplies/${flow.resupplyId}/receive`)
    .expect(204);
  const after = jsonBody<ResupplyReceiptView>(await staff().get(path).expect(200));
  expect(after.stock).toMatchObject([{ sku: CROISSANT, receivedQuantity: PACKED }]);
}

describe("le parcours « au plus tôt » du Village, du lancement à la réception", () => {
  it("le réassort du jour même d'un point servi par transfert s'enchaîne de bout en bout", async () => {
    await ctx.reset();
    // 1. J 07:00 — le Village envoie « au plus tôt ».
    const flow = await stepCounterSends();
    // 2. J 07:05 — « Lancer » : journée ouverte, fiche au colisage, transfert placé.
    const transferId = await stepLaunch(flow);
    // 3. J 08:00 — la fournée descend, 7 sur 8 emballés, fiche close.
    await stepPacking(flow);
    // 4. J 08:30 — chargé, parti : le manifeste fige l'emballé.
    const { roundId, paul } = await stepDeparture(transferId);
    // 5. J 09:00 — « Remis au site » : arrivé, cloche au comptoir.
    await stepSiteDrop(flow, roundId, paul);
    // 6. J 09:10 — le comptoir réceptionne 7.
    await stepReception(flow);
  });
});

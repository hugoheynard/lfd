/**
 * E2E du **réassort « au plus tôt » au transport** (lot R4c de
 * `documentation/reassort-boutiques/plan-au-plus-tot.md`, §2 ④).
 *
 * Ce qui ne s'éprouve qu'ici : le fait `production.resupply_launched` par la
 * vraie boîte d'envoi jusqu'au transfert du point et à sa tournée — le
 * premier transfert NON PARTI, ou un neuf ; la cloche du répartiteur quand
 * aucun véhicule n'est libre ; le transfert déjà chargé que l'écran signale ;
 * l'arrêt d'une journée ouverte par le lancement, appris par la livraison
 * sans `production.day_closed` ; et « Monté » refusé avant « Lancer ».
 *
 * L'horloge est gelée au matin de la journée servie (dans une semaine).
 * Aucune date du calendrier.
 */
import { localToInstant } from "@lfd/contracts";

import { RoadTravelTimeReader } from "../src/delivery/channels/commerce/index.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { binTypeId, depart, loadBin, loadingOf } from "./delivery-loading-scene.js";
import { addVehicle } from "./delivery-rounds-scene.js";
import { MEASURED, seedDeparture } from "./delivery-routing-scene.js";
import { declareTransferBins, FixedRoad, seedVillage } from "./internal-transfer-scene.js";
import { bootstrapProductionDay, CROISSANT, SERVICE_DAY, STAFF } from "./production-day-fixture.js";
import { counterSent } from "./site-resupply-scene.js";

const clock = new FixedClock(new Date());
let ctx: E2eContext;

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay([
    { token: Clock, value: clock },
    { token: RoadTravelTimeReader, value: new FixedRoad() },
  ]));
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  clock.set(local("08:00"));
});

function local(time: string): Date {
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

/** Le Village envoie « au plus tôt », le fournil le lance ; rend son identifiant. */
async function launched(site: string, quantity: number): Promise<string> {
  const id = await counterSent(staff(), site, "asap", [{ sku: CROISSANT, quantity }]);
  await staff().post(`/admin/production/batch/${SERVICE_DAY}/resupplies/${id}/launch`).expect(204);
  await settle();
  return id;
}

/** Le transfert qui porte ce réassort, et la tournée de son arrêt vivant (ou `null`). */
async function carrierOf(resupplyId: string) {
  const item = await ctx.prisma.deliveryInternalTransferItem.findFirstOrThrow({
    where: { kind: "resupply", resupplyId, detachedAt: null },
    select: { transferId: true },
  });
  const stop = await ctx.prisma.deliveryRoundStop.findFirst({
    where: { transferId: item.transferId, removedAt: null },
    select: { roundId: true },
  });
  return { transferId: item.transferId, roundId: stop?.roundId ?? null };
}

/** Le dépôt, une flotte de `vehicles` véhicules cotés, un type de bac, Val Village. */
async function scene(vehicles: number): Promise<string> {
  await seedDeparture(ctx);
  for (let index = 0; index < vehicles; index += 1) {
    await addVehicle(ctx, `Kangoo ${String(index + 1)}`, MEASURED);
  }
  await binTypeId(ctx);
  return seedVillage(ctx);
}

/** Déclare un bac au transfert, le charge, et rend la tournée. */
async function loadOneBin(transferId: string, roundId: string): Promise<void> {
  const [binId] = await declareTransferBins(ctx, transferId, 1);
  await loadBin(ctx, roundId, { binId: binId ?? "" }).expect(204);
}

function bells(kind: string) {
  return ctx.prisma.staffNotification.findMany({
    where: { kind },
    select: { subject: true, audience: true, idempotencyKey: true },
  });
}

describe("le réassort « au plus tôt » au transport (R4c)", () => {
  it("lancé : attaché à un transfert neuf du Village, placé dans une tournée, sans cloche", async () => {
    const village = await scene(1);

    const id = await launched(village, 6);

    const { transferId, roundId } = await carrierOf(id);
    expect(roundId).not.toBeNull();
    const transfer = await ctx.prisma.deliveryInternalTransfer.findUniqueOrThrow({
      where: { id: transferId },
      select: { siteId: true, serviceDay: true, departedAt: true },
    });
    expect(transfer).toEqual({ siteId: village, serviceDay: SERVICE_DAY, departedAt: null });
    expect(await bells("delivery.asap_transfer_unplaced")).toEqual([]);
  });

  it("la journée ouverte par le lancement : la livraison apprend l'arrêt, sans `day_closed`", async () => {
    const village = await scene(1);

    await launched(village, 6);

    const readiness = await ctx.prisma.deliveryDayReadiness.findUniqueOrThrow({
      where: { serviceDay: SERVICE_DAY },
      select: { closedAt: true, deliveryOrderIds: true },
    });
    expect(readiness).toEqual({ closedAt: clock.now(), deliveryOrderIds: [] });
    expect(await ctx.prisma.outboxMessage.count({ where: { type: "production.day_closed" } })).toBe(
      0,
    );
  });

  it("un transfert déjà parti n'en reçoit plus : un neuf, placé sur l'autre véhicule", async () => {
    const village = await scene(2);
    const first = await launched(village, 6);
    const departed = await carrierOf(first);
    await loadOneBin(departed.transferId, departed.roundId ?? "");
    expect((await depart(ctx, departed.roundId ?? "")).status).toBe(204);
    await settle();

    clock.set(local("10:00"));
    const second = await launched(village, 4);

    const fresh = await carrierOf(second);
    expect(fresh.transferId).not.toBe(departed.transferId);
    expect(fresh.roundId).not.toBeNull();
    expect(fresh.roundId).not.toBe(departed.roundId);
  });

  it("aucun véhicule libre : le transfert reste sans arrêt, la cloche du répartiteur sonne", async () => {
    const village = await scene(0);

    const id = await launched(village, 6);

    expect((await carrierOf(id)).roundId).toBeNull();
    expect(await bells("delivery.asap_transfer_unplaced")).toEqual([
      {
        subject: "Réassort au plus tôt sans tournée — Val Village",
        audience: "delivery_rounds:write",
        idempotencyKey: `notification:delivery.asap_transfer_unplaced:${id}`,
      },
    ]);
  });

  it("un transfert chargé mais pas parti le reçoit, et l'écran demande un bac de plus", async () => {
    const village = await scene(1);
    const first = await launched(village, 6);
    const carrier = await carrierOf(first);
    await loadOneBin(carrier.transferId, carrier.roundId ?? "");
    const before = await loadingOf(ctx, carrier.roundId ?? "");
    expect(before.transferStops?.[0]).toMatchObject({ state: "loaded", resuppliesAfterLoading: 0 });

    clock.set(local("08:30"));
    const second = await launched(village, 4);

    expect((await carrierOf(second)).transferId).toBe(carrier.transferId);
    const after = await loadingOf(ctx, carrier.roundId ?? "");
    expect(after.transferStops?.[0]).toMatchObject({ resuppliesAfterLoading: 1 });

    clock.set(local("08:40"));
    await loadOneBin(carrier.transferId, carrier.roundId ?? "");
    const reloaded = await loadingOf(ctx, carrier.roundId ?? "");
    expect(reloaded.transferStops?.[0]).toMatchObject({ resuppliesAfterLoading: 0 });
  });
});

describe("« Monté » sur un « au plus tôt » (R4c, Q4)", () => {
  it("refusé (409 nommé) avant « Lancer », accepté après", async () => {
    const labo = await ctx.prisma.site.create({
      data: {
        label: "Le Labo",
        ligne1: "1 place",
        codePostal: "73150",
        ville: "Val",
        pays: "France",
      },
      select: { id: true },
    });
    const id = await counterSent(staff(), labo.id, "asap", [{ sku: CROISSANT, quantity: 4 }]);
    const route = `/admin/bakehouse-resupplies/sites/${labo.id}/${id}/mounted`;

    const refused = await staff().post(route).expect(409);
    expect(jsonBody<{ code: string }>(refused).code).toBe("resupply.order.not_launched");
    expect(
      (
        await ctx.prisma.siteResupply.findUniqueOrThrow({
          where: { id },
          select: { arrivedAt: true },
        })
      ).arrivedAt,
    ).toBeNull();

    await staff()
      .post(`/admin/production/batch/${SERVICE_DAY}/resupplies/${id}/launch`)
      .expect(204);
    await settle();
    await staff().post(route).expect(204);
    expect(
      (
        await ctx.prisma.siteResupply.findUniqueOrThrow({
          where: { id },
          select: { arrivedAt: true },
        })
      ).arrivedAt,
    ).toEqual(clock.now());
  });
});

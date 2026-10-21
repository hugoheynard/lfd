/**
 * E2E du **réassort dans le transfert** (lot R3c de
 * `documentation/reassort-boutiques/plan-reapprovisionnement.md`, §13.1
 * point 7, §13.3, §13.4 « Après R3b » — Hugo 2026-10-21).
 *
 * Ce qui ne s'éprouve qu'ici : `production.day_closed` par la vraie boîte
 * d'envoi jusqu'au transfert du point (élément `kind = resupply`, index
 * partiel et CHECK réels), la copie figée lue au fournil, l'emballé lu au
 * colisage, la réouverture qui détache, les bacs du transfert, et la part du
 * Labo qui ne descend jamais au colisage.
 *
 * L'horloge est gelée la VEILLE de la journée servie (dans une semaine).
 */
import type { InternalTransferManifestView } from "@lfd/contracts";
import { addDays, localToInstant } from "@lfd/contracts";

import { RoadTravelTimeReader } from "../src/delivery/channels/commerce/index.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { FixedRoad, declareTransferBins, seedVillage } from "./internal-transfer-scene.js";
import {
  bootstrapProductionDay,
  closePlan,
  CROISSANT,
  recordBatch,
  SERVICE_DAY,
  STAFF,
} from "./production-day-fixture.js";
import { counterSent } from "./site-resupply-scene.js";

const EVE = addDays(SERVICE_DAY, -1);
const BATCH = "01K6A0000000000000000000R4";
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
  const eve = localToInstant(EVE, "12:00");
  if (eve === null) {
    throw new TypeError(`heure locale inexistante : ${EVE} 12:00`);
  }
  clock.set(eve);
});

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await ctx.drain();
  }
}

/** Le Labo : servi sur place, de la feuille à la vitrine. */
async function seedLabo(): Promise<string> {
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
  return labo.id;
}

function croissants(site: string, quantity: number): Promise<string> {
  return counterSent(ctx.asSub(STAFF), site, "tomorrow", [{ sku: CROISSANT, quantity }]);
}

async function resupplyItems() {
  return ctx.prisma.deliveryInternalTransferItem.findMany({
    where: { kind: "resupply" },
    select: { transferId: true, resupplyId: true, detachedAt: true },
  });
}

async function manifestOf(transferId: string): Promise<InternalTransferManifestView> {
  return jsonBody<InternalTransferManifestView>(
    await ctx.asSub(STAFF).get(`/admin/delivery/transfers/${transferId}/manifest`).expect(200),
  );
}

describe("le réassort dans le transfert (R3c)", () => {
  it("le réassort du Village ouvre le transfert de son point, sans commande ; le Labo jamais", async () => {
    const village = await seedVillage(ctx);
    const toVillage = await croissants(village, 6);
    await croissants(await seedLabo(), 4);

    await closePlan(ctx);
    await settle();

    const transfers = await ctx.prisma.deliveryInternalTransfer.findMany({
      select: { id: true, siteId: true, siteLabel: true, serviceDay: true },
    });
    expect(transfers.map(({ id: _id, ...site }) => site)).toEqual([
      { siteId: village, siteLabel: "Val Village", serviceDay: SERVICE_DAY },
    ]);
    expect(await resupplyItems()).toEqual([
      { transferId: transfers[0]?.id, resupplyId: toVillage, detachedAt: null },
    ]);
  });

  it("le manifeste porte le demandé, puis l'emballé une fois la fiche close", async () => {
    const id = await croissants(await seedVillage(ctx), 6);
    await closePlan(ctx);
    await settle();
    const [item] = await resupplyItems();
    const transferId = item?.transferId ?? "";

    const asked = await manifestOf(transferId);
    expect(asked.resupplies.items).toMatchObject([
      { kind: "resupply", subjectId: id, lines: [{ sku: CROISSANT, quantity: 6 }] },
    ]);

    expect(await recordBatch(ctx, BATCH, 6)).toBe(204);
    await settle();
    const sheet = `/admin/packing/${SERVICE_DAY}/resupplies/${id}`;
    await ctx.asSub(STAFF).put(`${sheet}/lines/${CROISSANT}`).send({ quantity: 4 }).expect(204);
    await ctx.asSub(STAFF).post(`${sheet}/close`).expect(204);

    expect((await manifestOf(transferId)).resupplies.totals).toEqual([
      expect.objectContaining({ sku: CROISSANT, quantity: 4 }),
    ]);
  });

  it("la réouverture détache le réassort ; le nouvel arrêt le rattache au même transfert", async () => {
    const id = await croissants(await seedVillage(ctx), 6);
    await closePlan(ctx);
    await settle();

    await ctx.asSub(STAFF).post(`/admin/production/batch/${SERVICE_DAY}/reopen`).expect(201);
    await settle();
    const [detached] = await resupplyItems();
    expect(detached?.detachedAt).not.toBeNull();

    // Un autre instant d'arrêt : la clé du fait `production.day_closed` le porte.
    clock.set(new Date(clock.now().getTime() + 60_000));
    await closePlan(ctx);
    await settle();
    const live = (await resupplyItems()).filter((item) => item.detachedAt === null);
    expect(live).toEqual([{ transferId: detached?.transferId, resupplyId: id, detachedAt: null }]);
  });

  it("un transfert de réassort seul reçoit ses bacs au chargement", async () => {
    await croissants(await seedVillage(ctx), 6);
    await closePlan(ctx);
    await settle();
    const [item] = await resupplyItems();

    const bins = await declareTransferBins(ctx, item?.transferId ?? "", 2);

    expect(bins).toHaveLength(2);
  });

  it("la part du Labo ne descend pas au colisage : seule celle du Village est remise", async () => {
    await croissants(await seedVillage(ctx), 6);
    await croissants(await seedLabo(), 4);
    await closePlan(ctx);
    await settle();

    expect(await recordBatch(ctx, BATCH, 10)).toBe(204);
    await settle();

    const handoffs = await ctx.prisma.productionHandoff.findMany({
      select: { id: true, quantity: true },
    });
    expect(handoffs).toEqual([{ id: BATCH, quantity: 6 }]);
    const stock = await ctx.prisma.packingStock.findMany({
      where: { serviceDay: SERVICE_DAY, sku: CROISSANT },
    });
    expect(stock).toEqual([expect.objectContaining({ received: 6 })]);
  });
});

/**
 * E2E du **réassort au colisage** (lot R3b de
 * `documentation/reassort-boutiques/plan-reapprovisionnement.md`, §13.1
 * points 5–6, §13.3, §13.4 — Hugo 2026-10-21).
 *
 * Ce qui ne s'éprouve qu'ici : le fait `production.resupply_list_drawn` par
 * la vraie boîte d'envoi jusqu'à la fiche du colisage, seulement pour un
 * point servi par transfert ; la saisie bornée et la clôture par les routes
 * du poste ; la réouverture qui retire la fiche, ou refusée quand elle est
 * entamée ; la réception du point pré-remplie de l'emballé, par le canal
 * `packing/channels/commerce/`.
 *
 * L'horloge est gelée la VEILLE de la journée servie (dans une semaine),
 * puis avancée au matin de la journée pour réceptionner.
 */
import type { PackingResuppliesView, ResupplyReceiptView } from "@lfd/contracts";
import { addDays, localToInstant } from "@lfd/contracts";

import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { RoadTravelTimeReader } from "../src/delivery/channels/commerce/index.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import {
  bootstrapProductionDay,
  closePlan,
  CROISSANT,
  recordBatch,
  SERVICE_DAY,
  STAFF,
} from "./production-day-fixture.js";
import { FixedRoad, seedVillage } from "./internal-transfer-scene.js";
import { counterSent } from "./site-resupply-scene.js";

const EVE = addDays(SERVICE_DAY, -1);
const BATCH = "01K6A0000000000000000000R3";
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
  clock.set(local(EVE, "12:00"));
});

function local(day: string, time: string): Date {
  const instant = localToInstant(day, time);
  if (instant === null) {
    throw new TypeError(`heure locale inexistante : ${day} ${time}`);
  }
  return instant;
}

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

const path = `/admin/packing/${SERVICE_DAY}/resupplies`;

async function sheets(): Promise<PackingResuppliesView> {
  return jsonBody<PackingResuppliesView>(await ctx.asSub(STAFF).get(path).expect(200));
}

function enter(resupplyId: string, quantity: number) {
  return ctx.asSub(STAFF).put(`${path}/${resupplyId}/lines/${CROISSANT}`).send({ quantity });
}

/** Un réassort de croissants pour demain au point, figé par l'arrêt, sa fiche livrée. */
async function frozenResupply(site: string, quantity: number): Promise<string> {
  const id = await counterSent(ctx.asSub(STAFF), site, "tomorrow", [{ sku: CROISSANT, quantity }]);
  await closePlan(ctx);
  await settle();
  return id;
}

function reopen() {
  return ctx.asSub(STAFF).post(`/admin/production/batch/${SERVICE_DAY}/reopen`);
}

describe("le réassort au colisage (R3b)", () => {
  it("une fiche s'ouvre pour le point servi par transfert, aucune pour le Labo", async () => {
    const village = await seedVillage(ctx);
    const labo = await seedLabo();
    const toVillage = await counterSent(ctx.asSub(STAFF), village, "tomorrow", [
      { sku: CROISSANT, quantity: 6 },
    ]);
    await counterSent(ctx.asSub(STAFF), labo, "tomorrow", [{ sku: CROISSANT, quantity: 4 }]);

    await closePlan(ctx);
    await settle();

    expect(await sheets()).toMatchObject({
      date: SERVICE_DAY,
      resupplies: [
        {
          resupplyId: toVillage,
          title: "Réassort Val Village",
          siteId: village,
          destination: { kind: "transfer", siteId: village },
          status: "open",
          closedAt: null,
          lines: [{ sku: CROISSANT, requested: 6, packed: null }],
        },
      ],
    });
    const facts = await ctx.prisma.outboxMessage.count({
      where: { type: "production.resupply_list_drawn" },
    });
    expect(facts).toBe(1);
  });

  it("la saisie est bornée à la quantité demandée ; la fiche se clôt une fois tout saisi", async () => {
    const id = await frozenResupply(await seedVillage(ctx), 6);
    expect(await recordBatch(ctx, BATCH, 6)).toBe(204);
    await settle();

    const tooMany = await enter(id, 7);
    expect(tooMany.status).toBe(400);
    expect(tooMany.body).toMatchObject({ code: "packing.resupply.packed_out_of_range" });

    await enter(id, 5).expect(204);
    await ctx.asSub(STAFF).post(`${path}/${id}/close`).expect(204);

    expect((await sheets()).resupplies[0]).toMatchObject({
      status: "closed",
      lines: [{ requested: 6, packed: 5 }],
    });
    const closedAgain = await enter(id, 6);
    expect(closedAgain.status).toBe(409);
  });

  it("la réouverture retire une fiche intouchée ; une fiche entamée la refuse", async () => {
    const id = await frozenResupply(await seedVillage(ctx), 6);

    await reopen().expect(201);
    await settle();
    expect((await sheets()).resupplies).toEqual([]);

    await closePlan(ctx);
    await settle();
    expect((await sheets()).resupplies.map((sheet) => sheet.resupplyId)).toEqual([id]);
    expect(await recordBatch(ctx, BATCH, 6)).toBe(204);
    await settle();
    await enter(id, 2).expect(204);

    const refused = await reopen();
    expect(refused.status).toBe(409);
  });

  it("la réception du point se pré-remplit de l'emballé, une fois la fiche close", async () => {
    const village = await seedVillage(ctx);
    const id = await frozenResupply(village, 6);
    expect(await recordBatch(ctx, BATCH, 6)).toBe(204);
    await settle();
    await enter(id, 4).expect(204);

    const receipts = `/admin/resupply-receipts/${village}`;
    const before = jsonBody<ResupplyReceiptView>(
      await ctx.asSub(STAFF).get(`${receipts}/${SERVICE_DAY}`).expect(200),
    );
    expect(before.receptions[0]?.lines[0]).toMatchObject({ expectedQuantity: 6 });

    await ctx.asSub(STAFF).post(`${path}/${id}/close`).expect(204);
    clock.set(local(SERVICE_DAY, "08:00"));
    await ctx.asSub(STAFF).post(`${receipts}/resupplies/${id}/receive`).expect(204);

    const after = jsonBody<ResupplyReceiptView>(
      await ctx.asSub(STAFF).get(`${receipts}/${SERVICE_DAY}`).expect(200),
    );
    expect(after.receptions[0]?.lines[0]).toMatchObject({
      expectedQuantity: 4,
      receivedQuantity: 4,
    });
  });
});

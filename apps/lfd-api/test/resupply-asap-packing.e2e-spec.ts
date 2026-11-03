/**
 * E2E du **réassort « au plus tôt » au colisage, et de sa réserve** (lot R4b
 * de `documentation/reassort-boutiques/au-plus-tot.md` — Hugo
 * 2026-10-22 : « le colisage réserve les pièces d'un réassort lancé »).
 *
 * Ce qui ne s'éprouve qu'ici : le fait `production.resupply_launched` par la
 * vraie boîte d'envoi jusqu'à la fiche `asap` et ses réservations ; le
 * verrou de `packing_stock` sous deux saisies CONCURRENTES et sous une
 * commande qui alloue PENDANT le lancement — dans les deux cas, jamais plus
 * au bac que sorti du four, et jamais une pièce réservée prise par un autre.
 *
 * L'horloge est gelée la VEILLE de la journée servie (dans une semaine) pour
 * passer commande et arrêter le plan, puis avancée au matin de la journée
 * pour envoyer et lancer « au plus tôt ». Aucune date du calendrier.
 */
import type { PackingResuppliesView, PackingSheet } from "@lfd/contracts";
import { addDays, localToInstant } from "@lfd/contracts";

import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { RoadTravelTimeReader } from "../src/delivery/channels/commerce/index.js";
import { gate, holdPackingStock, started, untilBlocked } from "./day-lock-race.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import {
  bagLines,
  bootstrapProductionDay,
  closePlan,
  CROISSANT,
  MEMBER,
  place,
  recordBatch,
  references,
  SERVICE_DAY,
  sheetOf,
  STAFF,
} from "./production-day-fixture.js";
import { FixedRoad, seedVillage } from "./internal-transfer-scene.js";
import { counterSent } from "./site-resupply-scene.js";

const EVE = addDays(SERVICE_DAY, -1);
const FIRST_BATCH = "01K6A0000000000000000000R4";
const CROISSANT_STOCK = { serviceDay: SERVICE_DAY, sku: CROISSANT };
const clock = new FixedClock(new Date());
let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay([
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

const path = `/admin/packing/${SERVICE_DAY}/resupplies`;

async function sheets(): Promise<PackingResuppliesView> {
  return jsonBody<PackingResuppliesView>(await ctx.asSub(STAFF).get(path).expect(200));
}

function enter(resupplyId: string, quantity: number) {
  return ctx.asSub(STAFF).put(`${path}/${resupplyId}/lines/${CROISSANT}`).send({ quantity });
}

/** Le matin de la journée : le Village envoie « au plus tôt » ; rend son identifiant. */
async function asapSent(village: string, quantity: number): Promise<string> {
  clock.set(local(SERVICE_DAY, "08:00"));
  return counterSent(ctx.asSub(STAFF), village, "asap", [{ sku: CROISSANT, quantity }]);
}

function launch(resupplyId: string) {
  return ctx
    .asSub(STAFF)
    .post(`/admin/production/batch/${SERVICE_DAY}/resupplies/${resupplyId}/launch`);
}

/** La réserve du croissant, telle que le verrou la tient. */
function stockRow() {
  return ctx.prisma.packingStock.findUniqueOrThrow({
    where: { serviceDay_sku: { serviceDay: SERVICE_DAY, sku: CROISSANT } },
    select: { received: true, returned: true, packed: true },
  });
}

describe("le réassort « au plus tôt » au colisage (R4b)", () => {
  it("le lancement ouvre la fiche en tête, réserve, attend le four, puis la clôture lève", async () => {
    const village = await seedVillage(ctx);
    const id = await asapSent(village, 6);

    await launch(id).expect(204);
    await settle();

    expect((await sheets()).resupplies[0]).toMatchObject({
      resupplyId: id,
      kind: "asap",
      title: "Réassort Val Village · au plus tôt",
      status: "open",
      awaitingOven: true,
      lines: [{ sku: CROISSANT, requested: 6, packed: null, awaitingOven: 6 }],
    });
    const refused = await enter(id, 6);
    expect(refused.status).toBe(409);

    expect(await recordBatch(ctx, FIRST_BATCH, 6)).toBe(204);
    await settle();
    expect((await sheets()).resupplies[0]).toMatchObject({ awaitingOven: false });
    await enter(id, 5).expect(204);
    await ctx.asSub(STAFF).post(`${path}/${id}/close`).expect(204);

    const reservation = await ctx.prisma.packingStockReservation.findFirstOrThrow({
      where: { serviceDay: SERVICE_DAY, resupplyId: id },
      select: { quantity: true, releasedAt: true },
    });
    expect(reservation).toEqual({ quantity: 6, releasedAt: clock.now() });
  });

  it("la fiche du soir ne prend pas la pièce réservée au « au plus tôt »", async () => {
    const village = await seedVillage(ctx);
    const evening = await counterSent(ctx.asSub(STAFF), village, "tomorrow", [
      { sku: CROISSANT, quantity: 4 },
    ]);
    await closePlan(ctx);
    await settle();
    const asap = await asapSent(village, 6);
    await launch(asap).expect(204);
    await settle();
    expect(await recordBatch(ctx, FIRST_BATCH, 8)).toBe(204);
    await settle();

    // Huit sortis, six réservés : il en reste deux pour la fiche du soir.
    const refused = await enter(evening, 4);
    expect(refused.status).toBe(409);
    await enter(asap, 6).expect(204);

    expect((await stockRow()).packed).toBe(6);
  });

  /**
   * La course, l'ordre imposé : la réserve est tenue, la saisie du soir se met
   * en file, celle du « au plus tôt » derrière elle. Les deux tiennent dans le
   * stock — deux sur huit libres, six réservés — et l'emballé doit faire leur
   * somme : sans le `FOR UPDATE` de la réserve, les deux lisent zéro et la
   * seconde écrase la première.
   */
  it("🔴 deux saisies en file sur la même réserve : l'emballé fait la somme des deux", async () => {
    const village = await seedVillage(ctx);
    const evening = await counterSent(ctx.asSub(STAFF), village, "tomorrow", [
      { sku: CROISSANT, quantity: 4 },
    ]);
    await closePlan(ctx);
    await settle();
    const asap = await asapSent(village, 6);
    await launch(asap).expect(204);
    await settle();
    expect(await recordBatch(ctx, FIRST_BATCH, 8)).toBe(204);
    await settle();
    const release = gate();
    const holder = await holdPackingStock(ctx, CROISSANT_STOCK, release.opened);

    const eveningEntry = started(enter(evening, 2));
    await untilBlocked(ctx, 1, eveningEntry);
    const asapEntry = started(enter(asap, 6));
    await untilBlocked(ctx, 2, Promise.race([eveningEntry, asapEntry]));
    release.open();
    await holder.done;
    const answers = await Promise.all([eveningEntry, asapEntry]);

    expect(answers.map((answer) => answer.status)).toEqual([204, 204]);
    const stock = await stockRow();
    expect(stock).toMatchObject({ received: 8, packed: 8 });
  });

  /** Une commande de six au bac, un « au plus tôt » de six envoyé, une fournée de six sortie. */
  async function orderAndAsapOverSixCroissants(): Promise<{ id: string; order: PackingSheet }> {
    await createUser(ctx.prisma, { auth0Sub: MEMBER });
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 6 }]);
    const village = await seedVillage(ctx);
    await closePlan(ctx);
    await settle();
    const id = await asapSent(village, 6);
    expect(await recordBatch(ctx, FIRST_BATCH, 6)).toBe(204);
    await settle();
    const [reference] = await references(ctx);
    return { id, order: await sheetOf(ctx, reference ?? "") };
  }

  /**
   * La course entre une commande mise au bac et la réserve que pose le
   * lancement, l'ordre imposé par la réserve tenue. La commande en file la
   * première prend les six : la fiche attend le four.
   */
  it("🔴 la commande en file avant la réserve : elle prend les six, la fiche attend le four", async () => {
    const { id, order } = await orderAndAsapOverSixCroissants();
    const release = gate();
    const holder = await holdPackingStock(ctx, CROISSANT_STOCK, release.opened);

    const bagged = started(bagLines(ctx, order));
    await untilBlocked(ctx, 1, bagged);
    const reserved = started(
      launch(id)
        .expect(204)
        .then(() => settle()),
    );
    await untilBlocked(ctx, 2, Promise.race([bagged, reserved]));
    release.open();
    await holder.done;
    const [status] = await Promise.all([bagged, reserved]);
    await settle();

    expect(status).toBe(204);
    expect((await stockRow()).packed).toBe(6);
    expect((await sheets()).resupplies[0]?.lines[0]?.awaitingOven).toBe(6);
  });

  /**
   * L'autre ordre : la réserve passe d'abord, la commande est refusée et rien
   * n'entre au bac. Sans le verrou, la commande lirait la réserve d'avant le
   * lancement et prendrait les pièces promises au point.
   */
  it("🔴 la réserve en file avant la commande : la commande est refusée, rien au bac", async () => {
    const { id, order } = await orderAndAsapOverSixCroissants();
    const release = gate();
    const holder = await holdPackingStock(ctx, CROISSANT_STOCK, release.opened);

    const reserved = started(
      launch(id)
        .expect(204)
        .then(() => settle()),
    );
    await untilBlocked(ctx, 1, reserved);
    const bagged = started(bagLines(ctx, order));
    await untilBlocked(ctx, 2, Promise.race([bagged, reserved]));
    release.open();
    await holder.done;
    const [, status] = await Promise.all([reserved, bagged]);
    await settle();

    expect(status).toBe(409);
    expect((await stockRow()).packed).toBe(0);
    expect((await sheets()).resupplies[0]?.lines[0]?.awaitingOven).toBe(0);
  });

  it("un réassort lancé du Labo, servi sur place, n'a ni fiche ni réserve", async () => {
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
    const id = await asapSent(labo.id, 4);

    await launch(id).expect(204);
    await settle();

    expect((await sheets()).resupplies).toEqual([]);
    expect(await ctx.prisma.packingStockReservation.count()).toBe(0);
  });
});

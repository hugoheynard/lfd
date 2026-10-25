/**
 * E2E du **réassort au plan figé** (lot R3a de
 * `documentation/reassort-boutiques/plan-reapprovisionnement.md`, §13.3, Hugo
 * 2026-10-21).
 *
 * Ce qui ne s'éprouve qu'ici : l'arrêt automatique à la plus tardive des deux
 * heures, le gel des réassorts dans les tables du fournil par le vrai canal,
 * le verrou de la journée partagé par l'envoi, l'annulation et l'arrêt, et la
 * réouverture qui dégèle.
 *
 * L'horloge est gelée la VEILLE de la journée servie (`SERVICE_DAY`, dans une
 * semaine) : les heures se comparent à elle seule, jamais au calendrier.
 */
import { Buffer } from "node:buffer";

import type {
  ProductionDayResuppliesView,
  ProductionForecastView,
  ResupplyArticleView,
  ResuppliesToProduceView,
  ResupplyProductionDayView,
} from "@lfd/contracts";
import { addDays, localToInstant } from "@lfd/contracts";

import { pdfPages } from "../src/platform/pdf/__tests__/pdf-text.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import {
  bootstrapProductionDay,
  CROISSANT,
  place,
  SERVICE_DAY,
  STAFF,
} from "./production-day-fixture.js";
import { counterSends, counterSent } from "./site-resupply-scene.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const EVE = addDays(SERVICE_DAY, -1);
const clock = new FixedClock(new Date());
let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay([{ token: Clock, value: clock }]));
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  clock.set(at("12:00"));
});

/** L'instant de la maison `time`, la veille de la journée servie. */
function at(time: string): Date {
  const instant = localToInstant(EVE, time);
  if (instant === null) {
    throw new TypeError(`heure locale inexistante : ${EVE} ${time}`);
  }
  return instant;
}

/** Générale la veille à 18:00 sans rattrapage, réassort la veille à 20:00. */
async function twoHours(): Promise<void> {
  await ctx
    .asSub(STAFF)
    .put("/admin/order-cutoffs/general")
    .send({ daysBefore: 1, time: "18:00", graceMinutes: 0 })
    .expect(204);
  await ctx
    .asSub(STAFF)
    .patch("/admin/order-cutoff-settings")
    .send({ resupplyCutoffTime: "20:00" })
    .expect(204);
}

async function tour(): Promise<string> {
  const response = await ctx
    .http()
    .post("/admin/production/auto-close")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  await ctx.drain();
  return jsonBody<{ outcome: string }>(response).outcome;
}

async function siteId(): Promise<string> {
  const existing = await ctx.prisma.site.findFirst({ select: { id: true } });
  if (existing !== null) {
    return existing.id;
  }
  const site = await ctx.prisma.site.create({
    data: {
      label: "Village",
      ligne1: "1 place",
      codePostal: "73150",
      ville: "Val",
      pays: "France",
    },
    select: { id: true },
  });
  return site.id;
}

async function article(): Promise<string> {
  const articles = jsonBody<readonly ResupplyArticleView[]>(
    await ctx.asSub(STAFF).get("/admin/resupply-receipts/articles").expect(200),
  );
  const found = articles.find((candidate) => candidate.sku === CROISSANT) ?? articles[0];
  if (found === undefined) {
    throw new Error("Le catalogue semé doit proposer un article.");
  }
  return found.sku;
}

async function sendTomorrow(quantity: number): Promise<{ site: string; id: string }> {
  const site = await siteId();
  const id = await counterSent(ctx.asSub(STAFF), site, "tomorrow", [
    { sku: await article(), quantity },
  ]);
  return { site, id };
}

async function frozen() {
  return ctx.prisma.productionResupply.findMany({
    where: { serviceDay: SERVICE_DAY },
    select: { resupplyId: true, lines: { select: { sku: true, quantity: true } } },
  });
}

async function countOf(sku: string): Promise<number | null> {
  const row = await ctx.prisma.productionCount.findFirst({
    where: { serviceDay: SERVICE_DAY, sku },
    select: { quantity: true },
  });
  return row?.quantity ?? null;
}

function cancel(site: string, id: string) {
  return ctx.asSub(STAFF).post(`/admin/site-resupplies/sites/${site}/${id}/cancel`);
}

describe("le réassort au plan figé (R3a)", () => {
  it("entre l'heure client et l'heure du réassort, l'envoi passe ; l'arrêt attend la plus tardive et le fige", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 4 }]);
    await twoHours();
    clock.set(at("19:00"));
    const sku = await article();
    const { id } = await sendTomorrow(6);

    expect(await tour()).toBe("nothing");
    clock.set(at("20:00"));
    expect(await tour()).toBe("closed");

    expect(await frozen()).toEqual([{ resupplyId: id, lines: [{ sku, quantity: 6 }] }]);
    expect(await countOf(sku)).toBe(sku === CROISSANT ? 10 : 6);
    const fact = await ctx.prisma.outboxMessage.findFirst({
      where: { type: "production.day_closed" },
      select: { payload: true },
    });
    expect(fact?.payload).toMatchObject({ resupplyIds: [id] });
  });

  it("après l'heure du réassort, l'envoi « pour demain » est refusé (409) et dit l'heure", async () => {
    await twoHours();
    clock.set(at("20:01"));
    const site = await siteId();

    const { sent } = await counterSends(ctx.asSub(STAFF), site, "tomorrow", [
      { sku: await article(), quantity: 2 },
    ]);

    expect(sent.status).toBe(409);
    expect(sent.body).toMatchObject({ code: "resupply.order.past_cutoff" });
    expect(JSON.stringify(sent.body)).toContain("la veille à 20:00");
  });

  it("figé, il ne s'annule plus (409) et quitte « Réassorts à produire » ; rouvert, il s'annule", async () => {
    await twoHours();
    clock.set(at("19:00"));
    const { site, id } = await sendTomorrow(3);
    clock.set(at("20:00"));
    expect(await tour()).toBe("closed");

    const refused = await cancel(site, id);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ code: "resupply.order.frozen_in_plan" });
    const toProduce = jsonBody<ResuppliesToProduceView>(
      await ctx.asSub(STAFF).get("/admin/site-resupplies/to-produce").expect(200),
    );
    expect(toProduce.days.find((day) => day.serviceDay === SERVICE_DAY)?.sites ?? []).toEqual([]);

    await ctx.asSub(STAFF).post(`/admin/production/batch/${SERVICE_DAY}/reopen`).expect(201);
    await ctx.drain();

    expect(await frozen()).toEqual([]);
    expect((await cancel(site, id)).status).toBe(204);
  });

  it("une journée de réassorts seuls s'arrête : elle n'est pas vide", async () => {
    await twoHours();
    clock.set(at("19:30"));
    const { id } = await sendTomorrow(5);
    clock.set(at("20:00"));

    expect(await tour()).toBe("closed");
    expect((await frozen()).map((row) => row.resupplyId)).toEqual([id]);
    expect(await ctx.prisma.productionOrder.count({ where: { serviceDay: SERVICE_DAY } })).toBe(0);
  });

  /**
   * La course : l'annulation et l'arrêt prennent le même verrou. Quelle que
   * soit l'issue, le plan et le commerce disent la même chose.
   */
  it("annulation et arrêt simultanés : l'un voit l'autre, jamais aucun des deux", async () => {
    await twoHours();
    clock.set(at("19:00"));
    const { site, id } = await sendTomorrow(4);
    clock.set(at("20:00"));

    const [cancelled] = await Promise.all([
      cancel(site, id),
      ctx.asSub(STAFF).post(`/admin/production/batch/${SERVICE_DAY}/close`),
    ]);
    await ctx.drain();

    const row = await ctx.prisma.siteResupply.findUniqueOrThrow({
      where: { id },
      select: { cancelledAt: true },
    });
    const inPlan = (await frozen()).some((frozenRow) => frozenRow.resupplyId === id);
    if (cancelled.status === 204) {
      expect([row.cancelledAt !== null, inPlan]).toEqual([true, false]);
    } else {
      expect(cancelled.status).toBe(409);
      expect([row.cancelledAt, inPlan]).toEqual([null, true]);
    }
  });
});

describe("Prod manager voit les réassorts (R3d)", () => {
  async function forecastDay() {
    const view = jsonBody<ProductionForecastView>(
      await ctx
        .asSub(STAFF)
        .get(`/admin/production/forecast?from=${SERVICE_DAY}&to=${SERVICE_DAY}`)
        .expect(200),
    );
    return view.days[0];
  }

  it("le prévisionnel compte le réassort envoyé à part, puis le figé ; l'onglet le montre figé", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 4 }]);
    await twoHours();
    clock.set(at("19:00"));
    const { id } = await sendTomorrow(6);

    expect(await forecastDay()).toMatchObject({ totalUnits: 10, resupplyUnits: 6, orderCount: 1 });

    clock.set(at("20:00"));
    expect(await tour()).toBe("closed");

    expect(await forecastDay()).toMatchObject({
      closed: true,
      totalUnits: 10,
      resupplyUnits: 6,
      orderCount: 1,
    });
    const day = jsonBody<ResupplyProductionDayView>(
      await ctx.asSub(STAFF).get(`/admin/site-resupplies/to-produce/${SERVICE_DAY}`).expect(200),
    );
    expect(day.planStopped).toBe(true);
    expect(day.sites.flatMap((site) => site.resupplies.map((resupply) => resupply.id))).toEqual([
      id,
    ]);
    expect(day.articles.length).toBeGreaterThan(0);
  });

  it("refuse une journée mal formée (400)", async () => {
    await ctx.asSub(STAFF).get("/admin/site-resupplies/to-produce/demain").expect(400);
  });

  async function dossierResupplies(): Promise<ProductionDayResuppliesView> {
    return jsonBody<ProductionDayResuppliesView>(
      await ctx.asSub(STAFF).get(`/admin/production/batch/${SERVICE_DAY}/resupplies`).expect(200),
    );
  }

  /**
   * Hugo, 2026-10-21 : « mes 18 sont dans le prévisionnel mais pas au dossier »,
   * puis (R3d-bis) « ça ne me l'a pas ajouté à la fiche de poste viennoiserie ».
   */
  it("le dossier du jour montre l'envoyé avant l'arrêt, le figé après ; le PDF le compte sur la fiche de poste et imprime son bon", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 4 }]);
    await twoHours();
    clock.set(at("19:00"));
    const { id } = await sendTomorrow(18);

    expect(await dossierResupplies()).toMatchObject({
      frozen: false,
      resupplies: [{ resupplyId: id, lines: [{ quantity: 18 }] }],
    });

    clock.set(at("20:00"));
    expect(await tour()).toBe("closed");
    expect(await dossierResupplies()).toMatchObject({
      frozen: true,
      resupplies: [{ resupplyId: id, lines: [{ quantity: 18 }] }],
    });

    const pdf = await ctx
      .asSub(STAFF)
      .get(`/admin/production/batch/${SERVICE_DAY}/dossier.pdf`)
      .buffer()
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          callback(null, Buffer.concat(chunks));
        });
      })
      .expect(200);
    const pages = Buffer.isBuffer(pdf.body) ? pdfPages(pdf.body) : [];
    expect(pages[0]).toMatch(/1 commande .*· 1 réassort · 22 pièces dont 18 de réassort/);
    // La couverture dit la part du réassort au rayon (mise en page du 2026-10-25) ;
    // la fiche de poste du croissant suit, plus loin dans le dossier.
    expect(pages[0]).toMatch(/dont 18 réassort\s+22 pièces/);
    expect(pages.at(-1)).toContain("RÉASSORT 1/1");
  });
});

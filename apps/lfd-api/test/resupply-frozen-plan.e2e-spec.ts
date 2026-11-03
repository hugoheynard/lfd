/**
 * E2E du **réassort au plan figé** (lot R3a de
 * `documentation/reassort-boutiques/README.md`, Hugo
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
  ResuppliesToProduceView,
  ResupplyProductionDayView,
} from "@lfd/contracts";

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
import {
  article,
  cancel,
  eveAt,
  frozen,
  sendTomorrow,
  siteId,
  tour,
  twoHours,
} from "./resupply-frozen-plan-scene.js";
import { counterSends } from "./site-resupply-scene.js";

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
  clock.set(eveAt("12:00"));
});

async function countOf(sku: string): Promise<number | null> {
  const row = await ctx.prisma.productionCount.findFirst({
    where: { serviceDay: SERVICE_DAY, sku },
    select: { quantity: true },
  });
  return row?.quantity ?? null;
}

describe("le réassort au plan figé (R3a)", () => {
  it("entre l'heure client et l'heure du réassort, l'envoi passe ; l'arrêt attend la plus tardive et le fige", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 4 }]);
    await twoHours(ctx);
    clock.set(eveAt("19:00"));
    const sku = await article(ctx);
    const { id } = await sendTomorrow(ctx, 6);

    expect(await tour(ctx)).toBe("nothing");
    clock.set(eveAt("20:00"));
    expect(await tour(ctx)).toBe("closed");

    expect(await frozen(ctx)).toEqual([{ resupplyId: id, lines: [{ sku, quantity: 6 }] }]);
    expect(await countOf(sku)).toBe(sku === CROISSANT ? 10 : 6);
    const fact = await ctx.prisma.outboxMessage.findFirst({
      where: { type: "production.day_closed" },
      select: { payload: true },
    });
    expect(fact?.payload).toMatchObject({ resupplyIds: [id] });
  });

  it("après l'heure du réassort, l'envoi « pour demain » est refusé (409) et dit l'heure", async () => {
    await twoHours(ctx);
    clock.set(eveAt("20:01"));
    const site = await siteId(ctx);

    const { sent } = await counterSends(ctx.asSub(STAFF), site, "tomorrow", [
      { sku: await article(ctx), quantity: 2 },
    ]);

    expect(sent.status).toBe(409);
    expect(sent.body).toMatchObject({ code: "resupply.order.past_cutoff" });
    expect(JSON.stringify(sent.body)).toContain("la veille à 20:00");
  });

  it("figé, il ne s'annule plus (409) et quitte « Réassorts à produire » ; rouvert, il s'annule", async () => {
    await twoHours(ctx);
    clock.set(eveAt("19:00"));
    const { site, id } = await sendTomorrow(ctx, 3);
    clock.set(eveAt("20:00"));
    expect(await tour(ctx)).toBe("closed");

    const refused = await cancel(ctx, site, id);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ code: "resupply.order.frozen_in_plan" });
    const toProduce = jsonBody<ResuppliesToProduceView>(
      await ctx.asSub(STAFF).get("/admin/site-resupplies/to-produce").expect(200),
    );
    expect(toProduce.days.find((day) => day.serviceDay === SERVICE_DAY)?.sites ?? []).toEqual([]);

    await ctx.asSub(STAFF).post(`/admin/production/batch/${SERVICE_DAY}/reopen`).expect(201);
    await ctx.drain();

    expect(await frozen(ctx)).toEqual([]);
    expect((await cancel(ctx, site, id)).status).toBe(204);
  });

  it("une journée de réassorts seuls s'arrête : elle n'est pas vide", async () => {
    await twoHours(ctx);
    clock.set(eveAt("19:30"));
    const { id } = await sendTomorrow(ctx, 5);
    clock.set(eveAt("20:00"));

    expect(await tour(ctx)).toBe("closed");
    expect((await frozen(ctx)).map((row) => row.resupplyId)).toEqual([id]);
    expect(await ctx.prisma.productionOrder.count({ where: { serviceDay: SERVICE_DAY } })).toBe(0);
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
    await twoHours(ctx);
    clock.set(eveAt("19:00"));
    const { id } = await sendTomorrow(ctx, 6);

    expect(await forecastDay()).toMatchObject({ totalUnits: 10, resupplyUnits: 6, orderCount: 1 });

    clock.set(eveAt("20:00"));
    expect(await tour(ctx)).toBe("closed");

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
    await twoHours(ctx);
    clock.set(eveAt("19:00"));
    const { id } = await sendTomorrow(ctx, 18);

    expect(await dossierResupplies()).toMatchObject({
      frozen: false,
      resupplies: [{ resupplyId: id, lines: [{ quantity: 18 }] }],
    });

    clock.set(eveAt("20:00"));
    expect(await tour(ctx)).toBe("closed");
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

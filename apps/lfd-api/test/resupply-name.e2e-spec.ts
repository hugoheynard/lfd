/**
 * E2E du **nom d'un réassort** (lot R1g de
 * `documentation/reassort-boutiques/plan-reapprovisionnement.md`, Hugo
 * 2026-10-21 : « vitrine du matin »).
 *
 * Ce qui ne s'éprouve qu'ici : la colonne et sa CHECK, le regroupement des
 * noms déjà employés en SQL sous le mur du point, et la copie du nom par
 * l'arrêt du plan jusqu'aux tables du fournil, puis au dossier.
 *
 * L'horloge est gelée la VEILLE de la journée servie (`SERVICE_DAY`, dans une
 * semaine) : les heures se comparent à elle seule, jamais au calendrier.
 */
import type {
  ProductionDayResuppliesView,
  ResupplyArticleView,
  ResupplyUsedNamesView,
  SiteResuppliesView,
} from "@lfd/contracts";
import { addDays, localToInstant } from "@lfd/contracts";

import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { bootstrapProductionDay, CROISSANT, SERVICE_DAY, STAFF } from "./production-day-fixture.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const EVE = addDays(SERVICE_DAY, -1);
const clock = new FixedClock(new Date());
let ctx: E2eContext;

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay([{ token: Clock, value: clock }]));
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

async function seedSite(label: string): Promise<string> {
  const site = await ctx.prisma.site.create({
    data: { label, ligne1: "1 place", codePostal: "73150", ville: "Val", pays: "France" },
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

async function listOf(site: string): Promise<SiteResuppliesView> {
  return jsonBody<SiteResuppliesView>(
    await ctx.asSub(STAFF).get(`/admin/site-resupplies/sites/${site}`).expect(200),
  );
}

function nameDraft(site: string, name: string | null) {
  return ctx
    .asSub(STAFF)
    .put(`/admin/site-resupplies/sites/${site}/drafts/tomorrow/name`)
    .send({ name });
}

/** Le fournil envoie un réassort « pour demain », nommé ou non. */
async function bakehouseSends(site: string, name?: string): Promise<string> {
  const response = await ctx
    .asSub(STAFF)
    .post(`/admin/bakehouse-resupplies/sites/${site}`)
    .send({
      target: "tomorrow",
      ...(name === undefined ? {} : { name }),
      lines: [{ sku: await article(), quantity: 6 }],
    })
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

describe("le nom d'un réassort (R1g)", () => {
  it("se pose sur la demande en cours, rogné ; part avec l'envoi, et ne se change plus", async () => {
    const site = await seedSite("Village");
    const named = jsonBody<{ id: string }>(
      await nameDraft(site, "  Vitrine du matin ").expect(200),
    );
    await ctx
      .asSub(STAFF)
      .post(`/admin/site-resupplies/sites/${site}/drafts/tomorrow/lines`)
      .send({ sku: await article(), quantity: 4 })
      .expect(201);

    const draft = (await listOf(site)).drafts[0];
    expect(draft).toMatchObject({ id: named.id, name: "Vitrine du matin" });

    await ctx
      .asSub(STAFF)
      .post(`/admin/site-resupplies/sites/${site}/${named.id}/send`)
      .send({ version: draft?.version })
      .expect(204);

    const after = await listOf(site);
    expect(after.resupplies).toEqual([
      expect.objectContaining({ id: named.id, name: "Vitrine du matin" }),
    ]);
    expect(after.drafts).toEqual([]);
    expect(after.usedNames).toEqual(["Vitrine du matin"]);
  });

  it("vide retire le nom ; plus de 60 caractères est refusé (400) et ne touche rien", async () => {
    const site = await seedSite("Village");
    await nameDraft(site, "Goûter").expect(200);

    const refused = await nameDraft(site, "x".repeat(61)).expect(400);
    expect(JSON.stringify(refused.body)).toContain("60 caractères");
    expect((await listOf(site)).drafts[0]?.name).toBe("Goûter");

    await nameDraft(site, "   ").expect(200);
    expect((await listOf(site)).drafts[0]?.name).toBeNull();
  });

  it("la base refuse un nom non rogné, quel que soit l'écrivain", async () => {
    const site = await seedSite("Village");
    const { id } = jsonBody<{ id: string }>(await nameDraft(site, "Goûter").expect(200));

    await expect(
      ctx.prisma
        .$executeRaw`UPDATE "public"."site_resupply" SET "name" = ' Goûter' WHERE "id" = ${id}`,
    ).rejects.toThrow(/site_resupply_name_trimmed/u);
  });

  it("les noms employés : distincts, les plus récents d'abord, ceux du point seulement", async () => {
    const village = await seedSite("Village");
    const labo = await seedSite("Labo");
    await bakehouseSends(village, "Vitrine du matin");
    await bakehouseSends(village, "Goûter");
    await bakehouseSends(labo, "Labo seul");
    await bakehouseSends(village, "Vitrine du matin");
    await bakehouseSends(village);

    const names = jsonBody<ResupplyUsedNamesView>(
      await ctx.asSub(STAFF).get(`/admin/bakehouse-resupplies/sites/${village}/names`).expect(200),
    );
    expect(names.names).toEqual(["Vitrine du matin", "Goûter"]);
    expect((await listOf(village)).usedNames).toEqual(["Vitrine du matin", "Goûter"]);
  });

  it("l'arrêt du plan le fige au fournil, et le dossier le lit", async () => {
    // Comme `resupply-frozen-plan` : l'arrêt automatique attend la plus
    // tardive des deux heures, générale et réassort.
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
    const site = await seedSite("Village");
    const id = await bakehouseSends(site, "Vitrine du matin");

    clock.set(at("20:00"));
    const tour = await ctx
      .http()
      .post("/admin/production/auto-close")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);
    await ctx.drain();
    expect(jsonBody<{ outcome: string }>(tour).outcome).toBe("closed");

    const frozen = await ctx.prisma.productionResupply.findMany({
      where: { serviceDay: SERVICE_DAY },
      select: { resupplyId: true, name: true },
    });
    expect(frozen).toEqual([{ resupplyId: id, name: "Vitrine du matin" }]);
    const dossier = jsonBody<ProductionDayResuppliesView>(
      await ctx.asSub(STAFF).get(`/admin/production/batch/${SERVICE_DAY}/resupplies`).expect(200),
    );
    expect(dossier).toMatchObject({
      frozen: true,
      resupplies: [{ resupplyId: id, name: "Vitrine du matin" }],
    });
  });
});

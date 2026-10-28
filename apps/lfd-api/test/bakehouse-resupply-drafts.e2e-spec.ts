/**
 * E2E des **brouillons du réassort du fournil** (plan
 * `documentation/reassort-boutiques/plan-brouillons-du-fournil.md`, Hugo
 * 2026-10-28).
 *
 * Ce qui ne s'éprouve qu'ici : la table et ses CHECK, le verrou de version
 * de deux postes sur le vrai Postgres, l'envoi qui crée un `SiteResupply`
 * d'origine `bakehouse` dans la même transaction que la clôture du brouillon,
 * et la demande en cours du comptoir INCHANGÉE après tout cela.
 *
 * L'horloge est gelée la VEILLE de la journée servie (`SERVICE_DAY`, dans une
 * semaine) : les heures se comparent à elle seule, jamais au calendrier.
 */
import type {
  BakehouseResupplyDraftView,
  ResupplyArticleView,
  SavedBakehouseResupplyDraftResponse,
  SiteResuppliesView,
} from "@lfd/contracts";
import { addDays, localToInstant } from "@lfd/contracts";

import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { bootstrapProductionDay, CROISSANT, SERVICE_DAY, STAFF } from "./production-day-fixture.js";

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
    await ctx.asSub(STAFF).get("/admin/bakehouse-resupplies/articles").expect(200),
  );
  const found = articles.find((candidate) => candidate.sku === CROISSANT) ?? articles[0];
  if (found === undefined) {
    throw new Error("Le catalogue semé doit proposer un article.");
  }
  return found.sku;
}

async function counterView(site: string): Promise<SiteResuppliesView> {
  return jsonBody<SiteResuppliesView>(
    await ctx.asSub(STAFF).get(`/admin/site-resupplies/sites/${site}`).expect(200),
  );
}

async function drafts(): Promise<readonly BakehouseResupplyDraftView[]> {
  return jsonBody<readonly BakehouseResupplyDraftView[]>(
    await ctx.asSub(STAFF).get("/admin/bakehouse-resupplies/drafts").expect(200),
  );
}

/** Le comptoir a une demande en cours « pour demain » au point. */
async function counterHasOpenDraft(site: string, sku: string): Promise<void> {
  await ctx
    .asSub(STAFF)
    .post(`/admin/site-resupplies/sites/${site}/drafts/tomorrow/lines`)
    .send({ sku, quantity: 3 })
    .expect(201);
}

describe("les brouillons du réassort du fournil", () => {
  it("créer, reprendre, réécrire puis envoyer : un réassort du fournil naît, la demande du comptoir est intacte", async () => {
    const site = await seedSite("Village");
    const sku = await article();
    await counterHasOpenDraft(site, sku);
    const counterBefore = await counterView(site);

    const created = jsonBody<SavedBakehouseResupplyDraftResponse>(
      await ctx
        .asSub(STAFF)
        .post("/admin/bakehouse-resupplies/drafts")
        .send({
          siteId: site,
          target: "tomorrow",
          name: " Vitrine du matin ",
          lines: [{ sku, quantity: 4 }],
        })
        .expect(201),
    );
    expect(created.version).toBe(1);
    expect(await drafts()).toEqual([
      expect.objectContaining({
        id: created.id,
        siteId: site,
        name: "Vitrine du matin",
        version: 1,
      }),
    ]);

    const saved = jsonBody<SavedBakehouseResupplyDraftResponse>(
      await ctx
        .asSub(STAFF)
        .put(`/admin/bakehouse-resupplies/drafts/${created.id}`)
        .send({
          siteId: site,
          target: "tomorrow",
          name: null,
          lines: [{ sku, quantity: 6 }],
          version: 1,
        })
        .expect(200),
    );
    expect(saved).toEqual({ id: created.id, version: 2 });
    expect(await counterView(site)).toEqual(counterBefore);

    const sent = jsonBody<{ id: string }>(
      await ctx
        .asSub(STAFF)
        .post(`/admin/bakehouse-resupplies/drafts/${created.id}/send`)
        .send({
          siteId: site,
          target: "tomorrow",
          name: "Goûter",
          lines: [{ sku, quantity: 9 }],
          version: 2,
        })
        .expect(201),
    );

    const resupply = await ctx.prisma.siteResupply.findUnique({
      where: { id: sent.id },
      select: {
        origin: true,
        name: true,
        placedAt: true,
        lines: { select: { sku: true, quantity: true } },
      },
    });
    expect(resupply).toMatchObject({
      origin: "bakehouse",
      name: "Goûter",
      lines: [{ sku, quantity: 9 }],
    });
    expect(resupply?.placedAt).not.toBeNull();
    const row = await ctx.prisma.bakehouseResupplyDraft.findUnique({ where: { id: created.id } });
    expect(row).toMatchObject({ status: "sent", sentResupplyId: sent.id, version: 3 });
    expect(await drafts()).toEqual([]);

    // La demande en cours du comptoir n'a pas bougé ; le réassort du fournil est à part.
    const counterAfter = await counterView(site);
    expect(counterAfter.drafts).toEqual(counterBefore.drafts);
    expect(counterAfter.resupplies.map((placed) => placed.id)).toEqual([sent.id]);
  });

  it("deux postes : le second qui écrit sur la même version reçoit 409", async () => {
    const site = await seedSite("Village");
    const sku = await article();
    const { id } = jsonBody<SavedBakehouseResupplyDraftResponse>(
      await ctx
        .asSub(STAFF)
        .post("/admin/bakehouse-resupplies/drafts")
        .send({ siteId: site, target: "asap", name: null, lines: [{ sku, quantity: 1 }] })
        .expect(201),
    );
    const content = { siteId: site, target: "asap", name: null, lines: [{ sku, quantity: 2 }] };

    await ctx
      .asSub(STAFF)
      .put(`/admin/bakehouse-resupplies/drafts/${id}`)
      .send({ ...content, version: 1 })
      .expect(200);
    await ctx
      .asSub(STAFF)
      .put(`/admin/bakehouse-resupplies/drafts/${id}`)
      .send({ ...content, version: 1 })
      .expect(409);
    await ctx
      .asSub(STAFF)
      .post(`/admin/bakehouse-resupplies/drafts/${id}/send`)
      .send({ ...content, version: 1 })
      .expect(409);
    expect(await ctx.prisma.siteResupply.count()).toBe(0);
  });

  it("un envoi refusé (article retiré) laisse le brouillon ouvert ; supprimé, il sort de la liste et reste en base", async () => {
    const site = await seedSite("Village");
    const sku = await article();
    await counterHasOpenDraft(site, sku);
    const counterBefore = await counterView(site);
    const { id } = jsonBody<SavedBakehouseResupplyDraftResponse>(
      await ctx
        .asSub(STAFF)
        .post("/admin/bakehouse-resupplies/drafts")
        .send({
          siteId: site,
          target: "tomorrow",
          name: null,
          lines: [{ sku: "RETIRE", quantity: 1 }],
        })
        .expect(201),
    );

    await ctx
      .asSub(STAFF)
      .post(`/admin/bakehouse-resupplies/drafts/${id}/send`)
      .send({
        siteId: site,
        target: "tomorrow",
        name: null,
        lines: [{ sku: "RETIRE", quantity: 1 }],
        version: 1,
      })
      .expect(404);
    expect(await drafts()).toEqual([expect.objectContaining({ id, version: 1 })]);

    await ctx
      .asSub(STAFF)
      .post(`/admin/bakehouse-resupplies/drafts/${id}/discard`)
      .send({ version: 1 })
      .expect(204);
    expect(await drafts()).toEqual([]);
    expect(await ctx.prisma.bakehouseResupplyDraft.findUnique({ where: { id } })).toMatchObject({
      status: "discarded",
    });
    await ctx
      .asSub(STAFF)
      .post(`/admin/bakehouse-resupplies/drafts/${id}/discard`)
      .send({ version: 2 })
      .expect(409);
    expect(await counterView(site)).toEqual(counterBefore);
  });

  it("la base refuse un brouillon envoyé sans réassort, quel que soit l'écrivain", async () => {
    const site = await seedSite("Village");
    const sku = await article();
    const { id } = jsonBody<SavedBakehouseResupplyDraftResponse>(
      await ctx
        .asSub(STAFF)
        .post("/admin/bakehouse-resupplies/drafts")
        .send({ siteId: site, target: "tomorrow", name: null, lines: [{ sku, quantity: 1 }] })
        .expect(201),
    );
    await expect(
      ctx.prisma
        .$executeRaw`UPDATE "public"."bakehouse_resupply_drafts" SET "status" = 'sent' WHERE "id" = ${id}`,
    ).rejects.toThrow(/bakehouse_resupply_draft_/u);
  });
});

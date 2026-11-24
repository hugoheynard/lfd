/**
 * E2E de **l'heure du réassort** (plan
 * `documentation/reassort-boutiques/plan-heure-du-reassort.md`, lot H1).
 *
 * Ce qui ne s'éprouve qu'ici : les refus `resupply.arrival.*` en 400 par les
 * vraies routes, l'heure écrite et relue dans les trois tables (réassort,
 * brouillon du fournil, modèle), les CHECK de la base, et l'heure proposée
 * lue dans les vrais réglages du point (ouverture pros − mise en place).
 *
 * L'horloge est gelée : les journées se comparent à elle seule.
 */
import { randomUUID } from "node:crypto";
import type {
  BakehouseResupplyDraftView,
  ResupplyArticleView,
  ResupplyTemplateView,
  SavedResupplyTemplateResponse,
  SiteResuppliesView,
  SiteResupplyDraftView,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

/** 10 h à Paris : bien avant toute heure limite du soir. */
const MORNING = new Date("2026-09-08T08:00:00Z");
const clock = new FixedClock(MORNING);

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: Clock, value: clock },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  clock.set(MORNING);
});

const admin = () => ctx.asSub(E2E_STAFF_SUB);

/** Le Village : ouverture pros à 07:30, dix minutes de mise en place — il demande 07:20. */
async function seedVillage(): Promise<string> {
  const site = await ctx.prisma.site.create({
    data: {
      label: "Val Village",
      ligne1: "1 place",
      codePostal: "73150",
      ville: "Val",
      pays: "France",
      supply: "transfer",
      counterSetupMinutes: 10,
      opening: { publicOpening: null, proPickup: { start: "07:30", end: "09:00" } },
    },
    select: { id: true },
  });
  return site.id;
}

/** Un point sans aucun horaire : aucune heure ne se calcule. */
async function seedBareSite(): Promise<string> {
  const site = await ctx.prisma.site.create({
    data: {
      label: "Sans heure",
      ligne1: "2 place",
      codePostal: "73150",
      ville: "Val",
      pays: "France",
    },
    select: { id: true },
  });
  return site.id;
}

async function articleSku(): Promise<ResupplyArticleView> {
  const [first] = jsonBody<readonly ResupplyArticleView[]>(
    await admin().get("/admin/resupply-receipts/articles").expect(200),
  );
  if (first === undefined) {
    throw new Error("Le catalogue semé doit proposer un article.");
  }
  return first;
}

async function counterView(siteId: string): Promise<SiteResuppliesView> {
  return jsonBody<SiteResuppliesView>(
    await admin().get(`/admin/site-resupplies/sites/${siteId}`).expect(200),
  );
}

async function openDraft(
  siteId: string,
  target: "tomorrow" | "asap",
  sku: string,
): Promise<SiteResupplyDraftView> {
  await admin()
    .post(`/admin/site-resupplies/sites/${siteId}/drafts/${target}/lines`)
    .set(INTENT_KEY, freshIntent())
    .send({ sku, quantity: 4 })
    .expect(201);
  const draft = (await counterView(siteId)).drafts.find((d) => d.target === target);
  if (draft === undefined) {
    throw new Error(`Aucune demande en cours « ${target} ».`);
  }
  return draft;
}

function send(siteId: string, draft: SiteResupplyDraftView, body: object) {
  return admin()
    .post(`/admin/site-resupplies/sites/${siteId}/${draft.id}/send`)
    .send({ version: draft.version, ...body });
}

describe("l'heure du réassort au comptoir (H1)", () => {
  it("« pour demain » sans heure est refusé (400), et la demande reste en cours", async () => {
    const siteId = await seedVillage();
    const draft = await openDraft(siteId, "tomorrow", (await articleSku()).sku);

    const refused = await send(siteId, draft, {}).expect(400);

    expect(refused.body).toMatchObject({ code: "resupply.arrival.required" });
    expect((await counterView(siteId)).drafts.map((d) => d.id)).toEqual([draft.id]);
  });

  it("une heure mal formée est refusée (400) en nommant la forme", async () => {
    const siteId = await seedVillage();
    const draft = await openDraft(siteId, "tomorrow", (await articleSku()).sku);

    const refused = await send(siteId, draft, { arrivalBy: "6h30" }).expect(400);

    expect(refused.body).toMatchObject({ code: "resupply.arrival.invalid" });
  });

  it("« au plus tôt » avec une heure est refusé (400)", async () => {
    const siteId = await seedVillage();
    const draft = await openDraft(siteId, "asap", (await articleSku()).sku);

    const refused = await send(siteId, draft, { arrivalBy: "06:30" }).expect(400);

    expect(refused.body).toMatchObject({ code: "resupply.arrival.asap" });
  });

  it("« pour demain » part avec son heure, relue au comptoir et en base", async () => {
    const siteId = await seedVillage();
    const draft = await openDraft(siteId, "tomorrow", (await articleSku()).sku);

    await send(siteId, draft, { arrivalBy: "06:30" }).expect(204);

    const view = await counterView(siteId);
    expect(view.resupplies).toEqual([
      expect.objectContaining({ id: draft.id, arrivalBy: "06:30" }),
    ]);
    const row = await ctx.prisma.siteResupply.findUnique({
      where: { id: draft.id },
      select: { arrivalBy: true },
    });
    expect(row?.arrivalBy).toBe("06:30");
  });

  it("le comptoir reçoit l'heure que son point demande pour demain ; un point sans horaire, aucune", async () => {
    const village = await seedVillage();
    const bare = await seedBareSite();

    expect((await counterView(village)).suggestedArrivalBy).toBe("07:20");
    expect((await counterView(bare)).suggestedArrivalBy).toBeNull();
  });

  it("la base refuse une heure sur un « au plus tôt » et une heure mal formée, quel que soit l'écrivain", async () => {
    const siteId = await seedVillage();
    const draft = await openDraft(siteId, "asap", (await articleSku()).sku);

    await expect(
      ctx.prisma
        .$executeRaw`UPDATE "public"."site_resupply" SET "arrival_by" = '06:30' WHERE "id" = ${draft.id}`,
    ).rejects.toThrow(/site_resupply_arrival_by_not_asap/u);
    await expect(
      ctx.prisma
        .$executeRaw`UPDATE "public"."site_resupply" SET "target" = 'tomorrow', "arrival_by" = '24:00' WHERE "id" = ${draft.id}`,
    ).rejects.toThrow(/site_resupply_arrival_by_clock/u);
  });
});

describe("l'heure du réassort sur un modèle (H1, H-D5)", () => {
  async function createTemplate(siteId: string, sku: string, saleUnit: string) {
    return jsonBody<SavedResupplyTemplateResponse>(
      await admin()
        .post(`/admin/resupply-templates/sites/${siteId}`)
        .send({
          key: randomUUID(),
          name: "Base matin",
          target: "tomorrow",
          arrivalBy: "06:30",
          lines: [{ sku, quantity: 12, saleUnit }],
        })
        .expect(201),
    ).id;
  }

  it("se garde sur le modèle, et se recopie sur la demande « pour demain » qui n'en a pas", async () => {
    const siteId = await seedVillage();
    const article = await articleSku();
    const templateId = await createTemplate(siteId, article.sku, article.saleUnit);

    const templates = jsonBody<readonly ResupplyTemplateView[]>(
      await admin().get(`/admin/resupply-templates/sites/${siteId}`).expect(200),
    );
    expect(templates).toEqual([expect.objectContaining({ id: templateId, arrivalBy: "06:30" })]);

    await admin()
      .post(`/admin/site-resupplies/sites/${siteId}/drafts/tomorrow/apply-template`)
      .set(INTENT_KEY, freshIntent())
      .send({ templateId, mode: "replace" })
      .expect(201);
    const draft = (await counterView(siteId)).drafts.find((d) => d.target === "tomorrow");
    expect(draft?.arrivalBy).toBe("06:30");

    // Sans heure dans l'envoi, celle du modèle part.
    if (draft !== undefined) {
      await send(siteId, draft, {}).expect(204);
    }
    expect((await counterView(siteId)).resupplies[0]?.arrivalBy).toBe("06:30");
  });

  it("refuse une heure sur un modèle « au plus tôt » (400)", async () => {
    const siteId = await seedVillage();
    const article = await articleSku();

    const refused = await admin()
      .post(`/admin/resupply-templates/sites/${siteId}`)
      .send({
        key: randomUUID(),
        name: "Goûter",
        target: "asap",
        arrivalBy: "16:00",
        lines: [{ sku: article.sku, quantity: 2, saleUnit: article.saleUnit }],
      })
      .expect(400);

    expect(refused.body).toMatchObject({ code: "resupply.arrival.asap" });
  });
});

describe("l'heure du réassort sur un brouillon du fournil (H1, H-D3)", () => {
  it("se garde, se liste avec l'heure proposée du point, et part avec le réassort", async () => {
    const siteId = await seedVillage();
    const { sku } = await articleSku();
    const content = {
      siteId,
      target: "tomorrow",
      name: null,
      arrivalBy: "05:45",
      lines: [{ sku, quantity: 3 }],
    };
    const key = randomUUID();
    await admin()
      .post("/admin/bakehouse-resupplies/drafts")
      .send({ key, ...content })
      .expect(201);

    const drafts = jsonBody<readonly BakehouseResupplyDraftView[]>(
      await admin().get("/admin/bakehouse-resupplies/drafts").expect(200),
    );
    expect(drafts).toEqual([
      expect.objectContaining({ id: key, arrivalBy: "05:45", suggestedArrivalBy: "07:20" }),
    ]);

    const sent = jsonBody<{ id: string }>(
      await admin()
        .post(`/admin/bakehouse-resupplies/drafts/${key}/send`)
        .send({ ...content, version: 1 })
        .expect(201),
    );
    const row = await ctx.prisma.siteResupply.findUnique({
      where: { id: sent.id },
      select: { arrivalBy: true },
    });
    expect(row?.arrivalBy).toBe("05:45");
  });

  it("« pour demain » sans heure ne part pas (400), et le brouillon reste ouvert", async () => {
    const siteId = await seedVillage();
    const { sku } = await articleSku();
    const content = { siteId, target: "tomorrow", name: null, lines: [{ sku, quantity: 3 }] };
    const key = randomUUID();
    await admin()
      .post("/admin/bakehouse-resupplies/drafts")
      .send({ key, ...content })
      .expect(201);

    const refused = await admin()
      .post(`/admin/bakehouse-resupplies/drafts/${key}/send`)
      .send({ ...content, version: 1 })
      .expect(400);

    expect(refused.body).toMatchObject({ code: "resupply.arrival.required" });
    const row = await ctx.prisma.bakehouseResupplyDraft.findUnique({ where: { id: key } });
    expect(row).toMatchObject({ status: "open", arrivalBy: null });
  });
});

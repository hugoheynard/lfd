/**
 * E2E de l'**application d'un modèle de réassort** à la demande en cours
 * (plan `documentation/reassort-boutiques/plan-modeles-de-reassort.md`, § 4,
 * lot T3).
 *
 * Ce qui ne s'éprouve qu'ici : le droit du comptoir, la clé d'intention
 * scellée dans la transaction sur le vrai registre (un rejeu en `add`
 * n'additionne pas deux fois), le vrai catalogue du réassort qui écarte un
 * article retiré, et un réassort envoyé que l'application ne touche pas.
 *
 * L'horloge est gelée : les journées se comparent à elle seule.
 */
import { randomUUID } from "node:crypto";
import type {
  AppliedResupplyTemplateResponse,
  ResupplyArticleView,
  SavedResupplyTemplateResponse,
  SiteResuppliesView,
  SiteResupplyDraftView,
} from "@lfd/contracts";
import type request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

/** 10 h à Paris : « au plus tôt » vise la journée de l'horloge gelée. */
const MORNING = new Date("2026-09-08T08:00:00Z");
const clock = new FixedClock(MORNING);
/** Un article que le catalogue du réassort ne propose pas : retiré. */
const RETIRED_SKU = "SKU-RETIRE-DU-CATALOGUE";

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

async function seedSite(label: string): Promise<string> {
  const site = await ctx.prisma.site.create({
    data: { label, ligne1: "1 place", codePostal: "73150", ville: "Val", pays: "France" },
    select: { id: true },
  });
  return site.id;
}

/** Un rôle créé à l'écran, qui ne tient que ces droits, et une personne qui le porte. */
async function holderOf(
  key: string,
  grants: readonly { readonly resource: string; readonly action: string }[],
): Promise<request.Agent> {
  await admin().post("/admin/staff-roles").send({ key, label: key, grants }).expect(201);
  const sub = `staff-${key}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: key,
      email: `${key}@lfc.test`,
      role: null,
      roleKey: key,
      status: "active",
      auth0Id: sub,
    },
  });
  return ctx.asSub(sub);
}

function counter(): Promise<request.Agent> {
  return holderOf("comptoir-modele", [{ resource: "handover_counter", action: "write" }]);
}

async function twoArticles(): Promise<readonly [ResupplyArticleView, ResupplyArticleView]> {
  const [first, second] = jsonBody<readonly ResupplyArticleView[]>(
    await admin().get("/admin/resupply-receipts/articles").expect(200),
  );
  if (first === undefined || second === undefined) {
    throw new Error("Le catalogue semé doit proposer deux articles.");
  }
  return [first, second];
}

interface TemplateLine {
  readonly sku: string;
  readonly quantity: number;
  readonly saleUnit: string;
}

async function createTemplate(siteId: string, lines: readonly TemplateLine[]): Promise<string> {
  const saved = jsonBody<SavedResupplyTemplateResponse>(
    await admin()
      .post(`/admin/resupply-templates/sites/${siteId}`)
      .send({ key: randomUUID(), name: "Base matin", target: "asap", lines })
      .expect(201),
  );
  return saved.id;
}

function apply(
  agent: request.Agent,
  siteId: string,
  body: { readonly templateId: string; readonly mode: "replace" | "add" },
  key = freshIntent(),
): request.Test {
  return agent
    .post(`/admin/site-resupplies/sites/${siteId}/drafts/asap/apply-template`)
    .set(INTENT_KEY, key)
    .send(body);
}

function addLine(agent: request.Agent, siteId: string, sku: string, quantity: number) {
  return agent
    .post(`/admin/site-resupplies/sites/${siteId}/drafts/asap/lines`)
    .set(INTENT_KEY, freshIntent())
    .send({ sku, quantity })
    .expect(201);
}

async function listOf(agent: request.Agent, siteId: string): Promise<SiteResuppliesView> {
  return jsonBody<SiteResuppliesView>(
    await agent.get(`/admin/site-resupplies/sites/${siteId}`).expect(200),
  );
}

async function draftOf(agent: request.Agent, siteId: string): Promise<SiteResupplyDraftView> {
  const draft = (await listOf(agent, siteId)).drafts.find((d) => d.target === "asap");
  if (draft === undefined) {
    throw new Error("Aucune demande en cours « asap » pour ce point.");
  }
  return draft;
}

const quantities = (draft: SiteResupplyDraftView) =>
  draft.lines.map((line) => [line.sku, line.quantity]);

describe("appliquer un modèle à la demande en cours", () => {
  it("replace pose le modèle, écarte l'article retiré et nomme la demande", async () => {
    const agent = await counter();
    const siteId = await seedSite("Village");
    const [first, second] = await twoArticles();
    await addLine(agent, siteId, second.sku, 3);
    const templateId = await createTemplate(siteId, [
      { sku: first.sku, quantity: 12, saleUnit: first.saleUnit },
      { sku: RETIRED_SKU, quantity: 2, saleUnit: "piece" },
    ]);

    const applied = jsonBody<AppliedResupplyTemplateResponse>(
      await apply(agent, siteId, { templateId, mode: "replace" }).expect(201),
    );

    expect(applied.skipped).toEqual([{ sku: RETIRED_SKU, reason: "withdrawn" }]);
    const draft = await draftOf(agent, siteId);
    expect(draft.id).toBe(applied.resupplyId);
    expect(draft.name).toBe("Base matin");
    expect(quantities(draft)).toEqual([[first.sku, 12]]);
  });

  it("add additionne, et la même clé rejouée n'additionne pas deux fois", async () => {
    const agent = await counter();
    const siteId = await seedSite("Village");
    const [first] = await twoArticles();
    await addLine(agent, siteId, first.sku, 3);
    const templateId = await createTemplate(siteId, [
      { sku: first.sku, quantity: 12, saleUnit: first.saleUnit },
    ]);
    const key = freshIntent();

    const once = jsonBody<AppliedResupplyTemplateResponse>(
      await apply(agent, siteId, { templateId, mode: "add" }, key).expect(201),
    );
    const replay = jsonBody<AppliedResupplyTemplateResponse>(
      await apply(agent, siteId, { templateId, mode: "add" }, key).expect(201),
    );

    expect(replay).toEqual(once);
    expect(quantities(await draftOf(agent, siteId))).toEqual([[first.sku, 15]]);
  });

  it("ne touche pas un réassort envoyé : le modèle remplit une nouvelle demande", async () => {
    const agent = await counter();
    const siteId = await seedSite("Village");
    const [first] = await twoArticles();
    await addLine(agent, siteId, first.sku, 3);
    const sent = await draftOf(agent, siteId);
    await agent
      .post(`/admin/site-resupplies/sites/${siteId}/${sent.id}/send`)
      .send({ version: sent.version })
      .expect(204);
    const templateId = await createTemplate(siteId, [
      { sku: first.sku, quantity: 12, saleUnit: first.saleUnit },
    ]);

    const applied = jsonBody<AppliedResupplyTemplateResponse>(
      await apply(agent, siteId, { templateId, mode: "replace" }).expect(201),
    );

    expect(applied.resupplyId).not.toBe(sent.id);
    const view = await listOf(agent, siteId);
    expect(view.resupplies.find((r) => r.id === sent.id)?.lines).toEqual([
      expect.objectContaining({ sku: first.sku, quantity: 3 }),
    ]);
    expect(quantities(await draftOf(agent, siteId))).toEqual([[first.sku, 12]]);
  });

  it("exige handover_counter:write, refuse un modèle d'un autre point (404) ou archivé (409)", async () => {
    const agent = await counter();
    const reader = await holderOf("comptoir-lecture", [
      { resource: "handover_counter", action: "read" },
    ]);
    const siteId = await seedSite("Village");
    const other = await seedSite("Halles");
    const [first] = await twoArticles();
    const line = { sku: first.sku, quantity: 1, saleUnit: first.saleUnit };
    const templateId = await createTemplate(siteId, [line]);
    const foreignId = await createTemplate(other, [line]);

    await apply(reader, siteId, { templateId, mode: "add" }).expect(403);
    await apply(agent, siteId, { templateId: foreignId, mode: "add" }).expect(404);
    await admin().post(`/admin/resupply-templates/${templateId}/archive`).expect(204);
    const archived = await apply(agent, siteId, { templateId, mode: "add" }).expect(409);
    expect(archived.body).toMatchObject({ code: "resupply.template.archived" });
    expect((await listOf(agent, siteId)).drafts).toEqual([]);
  });
});

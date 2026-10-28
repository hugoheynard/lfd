/**
 * E2E de la **demande de réassort en cours, enregistrée** (lot R1c de
 * `documentation/reassort-boutiques/plan-reapprovisionnement.md`, 2026-10-21).
 *
 * Ce qui ne s'éprouve qu'ici : l'index unique partiel (une seule demande en
 * cours par point, visée et journée), le verrou de version entre deux
 * postes jusqu'à la base, le mur par point sur chaque geste, et le fournil
 * qui ne voit jamais une demande non envoyée.
 *
 * L'horloge est gelée : les journées se comparent à elle seule.
 */
import type {
  ResupplyArticleView,
  ResuppliesToProduceView,
  SiteResuppliesView,
  SiteResupplyDraftView,
} from "@lfd/contracts";
import type request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

/** 10 h à Paris le 8 septembre. */
const MORNING = new Date("2026-09-08T08:00:00Z");
const TODAY = "2026-09-08";
const TOMORROW = "2026-09-09";
const DAY_MS = 24 * 60 * 60 * 1000;
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

async function seedSite(label: string): Promise<string> {
  const site = await ctx.prisma.site.create({
    data: { label, ligne1: "1 place", codePostal: "73150", ville: "Val d'Isère", pays: "France" },
    select: { id: true },
  });
  return site.id;
}

/** Un rôle créé à l'écran, qui ne tient que ces droits, et une personne qui le porte. */
async function holderOf(
  key: string,
  grants: readonly { resource: string; action: string }[],
): Promise<request.Agent> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .post("/admin/staff-roles")
    .send({ key, label: key, grants })
    .expect(201);
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
  return holderOf("comptoir-demande", [{ resource: "handover_counter", action: "write" }]);
}

async function twoArticles(
  agent: request.Agent,
): Promise<readonly [ResupplyArticleView, ResupplyArticleView]> {
  const [first, second] = jsonBody<readonly ResupplyArticleView[]>(
    await agent.get("/admin/resupply-receipts/articles").expect(200),
  );
  if (first === undefined || second === undefined) {
    throw new Error("Le catalogue semé doit proposer deux articles.");
  }
  return [first, second];
}

async function listOf(agent: request.Agent, siteId: string): Promise<SiteResuppliesView> {
  return jsonBody<SiteResuppliesView>(
    await agent.get(`/admin/site-resupplies/sites/${siteId}`).expect(200),
  );
}

async function draftOf(
  agent: request.Agent,
  siteId: string,
  target: "tomorrow" | "asap",
): Promise<SiteResupplyDraftView> {
  const draft = (await listOf(agent, siteId)).drafts.find((d) => d.target === target);
  if (draft === undefined) {
    throw new Error(`Aucune demande en cours « ${target} » pour ce point.`);
  }
  return draft;
}

function add(
  agent: request.Agent,
  siteId: string,
  target: string,
  sku: string,
  quantity: number,
): request.Test {
  return agent
    .post(`/admin/site-resupplies/sites/${siteId}/drafts/${target}/lines`)
    .send({ sku, quantity });
}

describe("la demande en cours", () => {
  it("se remplit (l'ajout additionne), se corrige, se vide d'une ligne, puis part au fournil", async () => {
    const agent = await counter();
    const siteId = await seedSite("Val Village");
    const [croissant, other] = await twoArticles(agent);
    const route = `/admin/site-resupplies/sites/${siteId}`;

    await add(agent, siteId, "asap", croissant.sku, 5).expect(201);
    await add(agent, siteId, "asap", other.sku, 2).expect(201);
    await add(agent, siteId, "asap", croissant.sku, 3).expect(201);
    let draft = await draftOf(agent, siteId, "asap");
    expect(draft).toMatchObject({ serviceDay: TODAY, version: 3 });
    expect(draft.lines.map((line) => [line.sku, line.quantity])).toEqual([
      [croissant.sku, 8],
      [other.sku, 2],
    ]);

    await agent
      .patch(`${route}/${draft.id}/lines/${croissant.sku}`)
      .send({ quantity: 10, version: draft.version })
      .expect(204);
    draft = await draftOf(agent, siteId, "asap");
    await agent
      .post(`${route}/${draft.id}/lines/${other.sku}/withdraw`)
      .send({ version: draft.version })
      .expect(204);
    draft = await draftOf(agent, siteId, "asap");
    expect(draft.lines).toEqual([{ sku: croissant.sku, label: croissant.name, quantity: 10 }]);

    // Rien d'envoyé : le fournil ne voit rien.
    const bakehouse = await holderOf("fournil", [
      { resource: "production_resupply", action: "read" },
    ]);
    const before = jsonBody<ResuppliesToProduceView>(
      await bakehouse.get("/admin/site-resupplies/to-produce").expect(200),
    );
    expect(before.days[0]?.sites).toEqual([]);

    await agent.post(`${route}/${draft.id}/send`).send({ version: draft.version }).expect(204);

    const after = jsonBody<ResuppliesToProduceView>(
      await bakehouse.get("/admin/site-resupplies/to-produce").expect(200),
    );
    expect(after.days[0]?.totals).toEqual([
      { sku: croissant.sku, label: croissant.name, quantity: 10 },
    ]);
    const view = await listOf(agent, siteId);
    expect(view.drafts).toEqual([]);
    expect(view.resupplies).toEqual([expect.objectContaining({ id: draft.id, status: "placed" })]);

    // Le prochain ajout ouvre une nouvelle demande pour la même visée.
    await add(agent, siteId, "asap", other.sku, 1).expect(201);
    expect((await draftOf(agent, siteId, "asap")).id).not.toBe(draft.id);
  });

  it("une demande vide ne part pas (400), et une demande envoyée ne bouge plus (409)", async () => {
    const agent = await counter();
    const siteId = await seedSite("Val Village");
    const [croissant] = await twoArticles(agent);
    const route = `/admin/site-resupplies/sites/${siteId}`;
    await add(agent, siteId, "tomorrow", croissant.sku, 1).expect(201);
    let draft = await draftOf(agent, siteId, "tomorrow");
    await agent
      .post(`${route}/${draft.id}/lines/${croissant.sku}/withdraw`)
      .send({ version: draft.version })
      .expect(204);
    draft = await draftOf(agent, siteId, "tomorrow");
    expect(draft).toMatchObject({ serviceDay: TOMORROW, lines: [] });

    const empty = await agent
      .post(`${route}/${draft.id}/send`)
      .send({ version: draft.version })
      .expect(400);
    expect(empty.body).toMatchObject({ code: "resupply.order.empty" });

    await add(agent, siteId, "tomorrow", croissant.sku, 1).expect(201);
    draft = await draftOf(agent, siteId, "tomorrow");
    await agent.post(`${route}/${draft.id}/send`).send({ version: draft.version }).expect(204);
    const frozen = await agent
      .patch(`${route}/${draft.id}/lines/${croissant.sku}`)
      .send({ quantity: 4, version: draft.version + 1 })
      .expect(409);
    expect(frozen.body).toMatchObject({ code: "resupply.order.already_placed" });
  });

  it("une demande « pour demain » dont la journée est passée quitte l'écran et ne part plus", async () => {
    const agent = await counter();
    const siteId = await seedSite("Val Village");
    const [croissant] = await twoArticles(agent);
    await add(agent, siteId, "tomorrow", croissant.sku, 1).expect(201);
    const stale = await draftOf(agent, siteId, "tomorrow");

    clock.set(new Date(MORNING.getTime() + 2 * DAY_MS));

    expect((await listOf(agent, siteId)).drafts).toEqual([]);
    const refused = await agent
      .post(`/admin/site-resupplies/sites/${siteId}/${stale.id}/send`)
      .send({ version: stale.version })
      .expect(409);
    expect(refused.body).toMatchObject({ code: "resupply.order.day_passed" });
    // Le prochain ajout ouvre la demande de la journée en cours, à côté.
    await add(agent, siteId, "tomorrow", croissant.sku, 1).expect(201);
    expect((await draftOf(agent, siteId, "tomorrow")).id).not.toBe(stale.id);
  });
});

describe("deux postes", () => {
  it("le verrou de version : le poste qui n'a plus la dernière version est refusé (409)", async () => {
    const first = await counter();
    const second = await holderOf("comptoir-second", [
      { resource: "handover_counter", action: "write" },
    ]);
    const siteId = await seedSite("Val Village");
    const [croissant] = await twoArticles(first);
    const route = `/admin/site-resupplies/sites/${siteId}`;
    await add(first, siteId, "asap", croissant.sku, 5).expect(201);
    const seenByFirst = await draftOf(first, siteId, "asap");

    // Le second poste corrige ; le premier corrige sur ce qu'il avait vu.
    await second
      .patch(`${route}/${seenByFirst.id}/lines/${croissant.sku}`)
      .send({ quantity: 7, version: seenByFirst.version })
      .expect(204);
    const refused = await first
      .patch(`${route}/${seenByFirst.id}/lines/${croissant.sku}`)
      .send({ quantity: 2, version: seenByFirst.version })
      .expect(409);
    expect(refused.body).toMatchObject({ code: "resupply.order.changed_meanwhile" });
    await first
      .post(`${route}/${seenByFirst.id}/send`)
      .send({ version: seenByFirst.version })
      .expect(409);

    expect((await draftOf(first, siteId, "asap")).lines[0]?.quantity).toBe(7);
  });

  it("l'index unique : la base refuse une seconde demande en cours pour la même visée", async () => {
    const agent = await counter();
    const siteId = await seedSite("Val Village");
    const [croissant] = await twoArticles(agent);
    await add(agent, siteId, "asap", croissant.sku, 1).expect(201);

    await expect(
      ctx.prisma.siteResupply.create({
        data: {
          id: "second-open-draft",
          siteId,
          target: "asap",
          serviceDay: new Date(`${TODAY}T00:00:00.000Z`),
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    // Une autre visée, ou une demande envoyée, n'y entrent pas.
    await add(agent, siteId, "tomorrow", croissant.sku, 1).expect(201);
    expect(await ctx.prisma.siteResupply.count({ where: { siteId } })).toBe(2);
  });
});

describe("le mur par point", () => {
  it("la demande d'un point est introuvable depuis un autre, pour chaque geste", async () => {
    const agent = await counter();
    const village = await seedSite("Val Village");
    const labo = await seedSite("Le Labo");
    const [croissant] = await twoArticles(agent);
    await add(agent, village, "asap", croissant.sku, 4).expect(201);
    const draft = await draftOf(agent, village, "asap");
    const elsewhere = `/admin/site-resupplies/sites/${labo}/${draft.id}`;

    expect((await listOf(agent, labo)).drafts).toEqual([]);
    await agent
      .patch(`${elsewhere}/lines/${croissant.sku}`)
      .send({ quantity: 1, version: draft.version })
      .expect(404);
    await agent
      .post(`${elsewhere}/lines/${croissant.sku}/withdraw`)
      .send({ version: draft.version })
      .expect(404);
    await agent.post(`${elsewhere}/send`).send({ version: draft.version }).expect(404);

    expect((await draftOf(agent, village, "asap")).lines[0]?.quantity).toBe(4);
  });

  it("le comptoir en lecture seule ne remplit pas la demande", async () => {
    const siteId = await seedSite("Val Village");
    const reader = await holderOf("comptoir-lecture", [
      { resource: "handover_counter", action: "read" },
    ]);
    await add(reader, siteId, "asap", "VIE-001", 1).expect(403);
    await add(reader, siteId, "hier", "VIE-001", 1).expect(403);
  });
});

/**
 * E2E du **réassort commandé par un point** (lot R1 de
 * `documentation/reassort-boutiques/plan-reapprovisionnement.md`, §12,
 * 2026-10-21).
 *
 * Ce qui ne s'éprouve qu'ici : le droit du comptoir (`handover_counter`) et
 * celui du fournil pour la lecture, le mur par point (un réassort d'un autre
 * point est introuvable), l'heure limite lue dans la vraie règle générale et
 * le vrai réglage « réassort soumis », la quantité refusée jusqu'à la base.
 *
 * L'horloge est gelée : la limite se compare à elle seule, jamais au calendrier.
 */
import type {
  ResupplyArticleView,
  ResuppliesToProduceView,
  SiteResuppliesView,
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

/** 20 h à Paris le 8 septembre (heure d'été) : après une limite à 18 h pour le lendemain. */
const EVENING = new Date("2026-09-08T18:00:00Z");
const TODAY = "2026-09-08";
const TOMORROW = "2026-09-09";
const clock = new FixedClock(EVENING);

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
  clock.set(EVENING);
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
  return holderOf("comptoir-commande", [{ resource: "handover_counter", action: "write" }]);
}

async function firstArticle(agent: request.Agent): Promise<ResupplyArticleView> {
  const [article] = jsonBody<readonly ResupplyArticleView[]>(
    await agent.get("/admin/resupply-receipts/articles").expect(200),
  );
  if (article === undefined) {
    throw new Error("Le catalogue semé doit proposer un article.");
  }
  return article;
}

async function listOf(agent: request.Agent, siteId: string): Promise<SiteResuppliesView> {
  return jsonBody<SiteResuppliesView>(
    await agent.get(`/admin/site-resupplies/sites/${siteId}`).expect(200),
  );
}

/** La règle générale : la veille à 18 h, posée par la route de l'écran. */
async function cutoffAtSixTheDayBefore(): Promise<void> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .put("/admin/order-cutoffs/general")
    .send({ daysBefore: 1, time: "18:00" })
    .expect(204);
}

async function resupplySubjectToCutoff(subject: boolean): Promise<void> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .patch("/admin/order-cutoff-settings")
    .send({ resupplySubjectToCutoff: subject })
    .expect(204);
}

describe("commander un réassort", () => {
  it("le comptoir passe un réassort « au plus tôt », le relit, puis l'annule", async () => {
    const agent = await counter();
    const siteId = await seedSite("Val Village");
    const article = await firstArticle(agent);

    const placed = await agent
      .post(`/admin/site-resupplies/sites/${siteId}`)
      .send({ target: "asap", lines: [{ sku: article.sku, quantity: 12 }] })
      .expect(201);
    const { id } = jsonBody<{ id: string }>(placed);

    const view = await listOf(agent, siteId);
    expect(view).toMatchObject({ today: TODAY, tomorrow: TOMORROW });
    expect(view.resupplies).toEqual([
      expect.objectContaining({
        id,
        serviceDay: TODAY,
        target: "asap",
        status: "placed",
        lines: [{ sku: article.sku, label: article.name, quantity: 12 }],
      }),
    ]);

    await agent.post(`/admin/site-resupplies/sites/${siteId}/${id}/cancel`).expect(204);
    await agent.post(`/admin/site-resupplies/sites/${siteId}/${id}/cancel`).expect(409);
    expect((await listOf(agent, siteId)).resupplies[0]?.status).toBe("cancelled");
    // Une annulation est un état : la ligne reste.
    expect(await ctx.prisma.siteResupply.count()).toBe(1);
  });

  it("refuse une quantité nulle (400), un article inconnu (404), un réassort vide (400)", async () => {
    const agent = await counter();
    const siteId = await seedSite("Val Village");
    const article = await firstArticle(agent);
    const route = `/admin/site-resupplies/sites/${siteId}`;

    await agent
      .post(route)
      .send({ target: "asap", lines: [{ sku: article.sku, quantity: 0 }] })
      .expect(400);
    await agent
      .post(route)
      .send({ target: "asap", lines: [{ sku: "INCONNU-9", quantity: 1 }] })
      .expect(404);
    await agent.post(route).send({ target: "asap", lines: [] }).expect(400);
    await agent.post(route).send({ target: "hier", lines: [] }).expect(400);

    expect(await ctx.prisma.siteResupply.count()).toBe(0);
  });
});

describe("le mur par point", () => {
  it("chaque point voit les siens, et n'annule pas ceux d'un autre", async () => {
    const agent = await counter();
    const village = await seedSite("Val Village");
    const labo = await seedSite("Le Labo");
    const article = await firstArticle(agent);
    const { id } = jsonBody<{ id: string }>(
      await agent
        .post(`/admin/site-resupplies/sites/${village}`)
        .send({ target: "asap", lines: [{ sku: article.sku, quantity: 4 }] })
        .expect(201),
    );

    expect((await listOf(agent, labo)).resupplies).toEqual([]);
    await agent.post(`/admin/site-resupplies/sites/${labo}/${id}/cancel`).expect(404);
    expect((await listOf(agent, village)).resupplies[0]?.status).toBe("placed");
  });
});

describe("l'heure limite", () => {
  it("soumis : « pour demain » est refusé après la limite (409), « au plus tôt » passe", async () => {
    await cutoffAtSixTheDayBefore();
    const agent = await counter();
    const siteId = await seedSite("Val Village");
    const article = await firstArticle(agent);
    const route = `/admin/site-resupplies/sites/${siteId}`;
    const lines = [{ sku: article.sku, quantity: 3 }];

    const refused = await agent.post(route).send({ target: "tomorrow", lines }).expect(409);
    expect(refused.body).toMatchObject({ code: "resupply.order.past_cutoff" });
    await agent.post(route).send({ target: "asap", lines }).expect(201);

    const view = await listOf(agent, siteId);
    expect(view.tomorrowOrderUntil).toBe("2026-09-08T16:00:00.000Z");
  });

  it("soumis : « pour demain » passe avant la limite", async () => {
    await cutoffAtSixTheDayBefore();
    clock.set(new Date("2026-09-08T15:59:00Z"));
    const agent = await counter();
    const siteId = await seedSite("Val Village");
    const article = await firstArticle(agent);

    await agent
      .post(`/admin/site-resupplies/sites/${siteId}`)
      .send({ target: "tomorrow", lines: [{ sku: article.sku, quantity: 3 }] })
      .expect(201);
  });

  it("sans limite : « pour demain » passe le soir, et aucune limite n'est annoncée", async () => {
    await cutoffAtSixTheDayBefore();
    await resupplySubjectToCutoff(false);
    const agent = await counter();
    const siteId = await seedSite("Val Village");
    const article = await firstArticle(agent);

    await agent
      .post(`/admin/site-resupplies/sites/${siteId}`)
      .send({ target: "tomorrow", lines: [{ sku: article.sku, quantity: 3 }] })
      .expect(201);
    expect((await listOf(agent, siteId)).tomorrowOrderUntil).toBeNull();
  });
});

describe("les droits", () => {
  it("le comptoir en lecture seule ne passe pas ; un autre métier ne lit pas", async () => {
    const siteId = await seedSite("Val Village");
    const reader = await holderOf("comptoir-lecture", [
      { resource: "handover_counter", action: "read" },
    ]);
    await reader.get(`/admin/site-resupplies/sites/${siteId}`).expect(200);
    await reader
      .post(`/admin/site-resupplies/sites/${siteId}`)
      .send({ target: "asap", lines: [{ sku: "VIE-001", quantity: 1 }] })
      .expect(403);

    const other = await holderOf("commandes-seules", [{ resource: "b2b_orders", action: "read" }]);
    await other.get(`/admin/site-resupplies/sites/${siteId}`).expect(403);
    await other.get("/admin/site-resupplies/to-produce").expect(403);
  });

  it("le fournil lit les réassorts à produire, sans les annulés ; le comptoir seul ne les lit pas", async () => {
    const agent = await counter();
    const village = await seedSite("Val Village");
    const article = await firstArticle(agent);
    const route = `/admin/site-resupplies/sites/${village}`;
    await agent
      .post(route)
      .send({ target: "asap", lines: [{ sku: article.sku, quantity: 5 }] })
      .expect(201);
    const { id } = jsonBody<{ id: string }>(
      await agent
        .post(route)
        .send({ target: "tomorrow", lines: [{ sku: article.sku, quantity: 9 }] })
        .expect(201),
    );
    await agent.post(`${route}/${id}/cancel`).expect(204);

    await agent.get("/admin/site-resupplies/to-produce").expect(403);
    const bakehouse = await holderOf("fournil", [
      { resource: "production_worksheet", action: "read" },
    ]);
    const view = jsonBody<ResuppliesToProduceView>(
      await bakehouse.get("/admin/site-resupplies/to-produce").expect(200),
    );

    expect(view.days.map((day) => day.serviceDay)).toEqual([TODAY, TOMORROW]);
    expect(view.days[0]?.sites.map((site) => site.siteLabel)).toEqual(["Val Village"]);
    expect(view.days[0]?.totals).toEqual([{ sku: article.sku, label: article.name, quantity: 5 }]);
    expect(view.days[1]?.sites).toEqual([]);
  });
});

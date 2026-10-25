/**
 * E2E du **réassort commandé par un point** (lot R1 de
 * `documentation/reassort-boutiques/plan-reapprovisionnement.md`, §12,
 * 2026-10-21).
 *
 * Ce qui ne s'éprouve qu'ici : le droit du comptoir (`handover_counter`) et
 * celui du fournil pour la lecture, le mur par point (un réassort d'un autre
 * point est introuvable), l'heure limite lue dans la vraie règle générale et
 * la vraie heure du réassort (lot R3a), la quantité refusée jusqu'à la base.
 *
 * Depuis le lot R1d (2026-10-21) : le réassort que le FOURNIL envoie, sous
 * son droit neuf `production_resupply`, à part de la demande du comptoir.
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
import { counterSends, counterSent } from "./site-resupply-scene.js";

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

function bakehouseSender(): Promise<request.Agent> {
  return holderOf("fournil-envoi", [{ resource: "production_resupply", action: "write" }]);
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

/** L'heure du réassort (lot R3a), posée par la route de l'écran. */
async function resupplyCutoffAt(time: string): Promise<void> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .patch("/admin/order-cutoff-settings")
    .send({ resupplyCutoffTime: time })
    .expect(204);
}

describe("commander un réassort", () => {
  it("le comptoir envoie un réassort « au plus tôt », le relit, puis l'annule", async () => {
    const agent = await counter();
    const siteId = await seedSite("Val Village");
    const article = await firstArticle(agent);

    const id = await counterSent(agent, siteId, "asap", [{ sku: article.sku, quantity: 12 }]);

    const view = await listOf(agent, siteId);
    expect(view).toMatchObject({ today: TODAY, tomorrow: TOMORROW });
    expect(view.resupplies).toEqual([
      expect.objectContaining({
        id,
        serviceDay: TODAY,
        target: "asap",
        origin: "counter",
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

  /** R1d : le `POST` d'un seul tenant, qui envoyait la demande du comptoir, est retiré. */
  it("le geste d'un seul tenant n'existe plus côté comptoir (404)", async () => {
    const agent = await counter();
    const siteId = await seedSite("Val Village");

    await agent
      .post(`/admin/site-resupplies/sites/${siteId}`)
      .send({ target: "asap", lines: [{ sku: "VIE-001", quantity: 1 }] })
      .expect(404);
  });
});

describe("le fournil envoie un réassort (R1d)", () => {
  it("crée un réassort à part, signé du fournil ; la demande en cours du comptoir ne bouge pas", async () => {
    const desk = await counter();
    const sender = await bakehouseSender();
    const siteId = await seedSite("Val Village");
    const article = await firstArticle(desk);
    const draftRoute = `/admin/site-resupplies/sites/${siteId}/drafts/asap/lines`;
    await desk.post(draftRoute).send({ sku: article.sku, quantity: 2 }).expect(201);
    const before = (await listOf(desk, siteId)).drafts;

    const sent = await sender
      .post(`/admin/bakehouse-resupplies/sites/${siteId}`)
      .send({ target: "asap", lines: [{ sku: article.sku, quantity: 10 }] })
      .expect(201);

    const { id } = jsonBody<{ id: string }>(sent);
    const view = await listOf(desk, siteId);
    expect(view.drafts).toEqual(before);
    expect(view.resupplies).toEqual([
      expect.objectContaining({
        id,
        origin: "bakehouse",
        status: "placed",
        lines: [{ sku: article.sku, label: article.name, quantity: 10 }],
      }),
    ]);
  });

  it("refuse une quantité nulle (400), un article inconnu (404), un envoi vide (400), un point inconnu (404)", async () => {
    const sender = await bakehouseSender();
    const siteId = await seedSite("Val Village");
    const [article] = jsonBody<readonly ResupplyArticleView[]>(
      await sender.get("/admin/bakehouse-resupplies/articles").expect(200),
    );
    const sku = article?.sku ?? "";
    const route = `/admin/bakehouse-resupplies/sites/${siteId}`;

    await sender
      .post(route)
      .send({ target: "asap", lines: [{ sku, quantity: 0 }] })
      .expect(400);
    await sender
      .post(route)
      .send({ target: "asap", lines: [{ sku: "INCONNU-9", quantity: 1 }] })
      .expect(404);
    await sender.post(route).send({ target: "asap", lines: [] }).expect(400);
    await sender.post(route).send({ target: "hier", lines: [] }).expect(400);
    await sender
      .post("/admin/bakehouse-resupplies/sites/site_inconnu")
      .send({ target: "asap", lines: [{ sku, quantity: 1 }] })
      .expect(404);

    expect(await ctx.prisma.siteResupply.count()).toBe(0);
  });

  it("« pour demain » du fournil bute sur la même heure du réassort que le comptoir (409, R3a)", async () => {
    await resupplyCutoffAt("18:00");
    const sender = await bakehouseSender();
    const siteId = await seedSite("Val Village");
    const article = await firstArticle(await counter());
    const lines = [{ sku: article.sku, quantity: 3 }];
    const route = `/admin/bakehouse-resupplies/sites/${siteId}`;

    const refused = await sender.post(route).send({ target: "tomorrow", lines }).expect(409);
    expect(refused.body).toMatchObject({ code: "resupply.order.bakehouse_after_stop" });
    await sender.post(route).send({ target: "asap", lines }).expect(201);
  });

  it("son droit à lui : ni le comptoir ni la fournée n'envoient ; la lecture voit points et articles", async () => {
    const siteId = await seedSite("Val Village");
    const body = { target: "asap", lines: [{ sku: "VIE-001", quantity: 1 }] };
    const route = `/admin/bakehouse-resupplies/sites/${siteId}`;

    await (await counter()).post(route).send(body).expect(403);
    const worksheet = await holderOf("fournee", [
      { resource: "production_worksheet", action: "write" },
    ]);
    await worksheet.post(route).send(body).expect(403);
    await worksheet.get("/admin/bakehouse-resupplies/articles").expect(403);

    const reader = await holderOf("fournil-envoi-lecture", [
      { resource: "production_resupply", action: "read" },
    ]);
    await reader.post(route).send(body).expect(403);
    // A1.4 : la sortie de réserve vers une boutique exige le même droit en
    // écriture. Testé ici et pas dans reserve-sent-to-shop.e2e-spec.ts : le
    // harnais de la journée de production rend toujours l'administrateur.
    await reader
      .post("/admin/reserve-shop-releases/2030-01-01")
      .send({ siteId: "site", key: "k", lines: [{ sku: "SKU", quantity: 1 }] })
      .expect(403);
    await reader.get("/admin/bakehouse-resupplies/articles").expect(200);
    const sites = jsonBody<readonly { id: string }[]>(
      await reader.get("/admin/pickup-addresses").expect(200),
    );
    expect(sites.map((site) => site.id)).toContain(siteId);
    // Le droit du fournil n'ouvre pas le comptoir.
    await reader.get(`/admin/site-resupplies/sites/${siteId}`).expect(403);
  });
});

describe("le mur par point", () => {
  it("chaque point voit les siens, et n'annule pas ceux d'un autre", async () => {
    const agent = await counter();
    const village = await seedSite("Val Village");
    const labo = await seedSite("Le Labo");
    const article = await firstArticle(agent);
    const id = await counterSent(agent, village, "asap", [{ sku: article.sku, quantity: 4 }]);
    const sender = await bakehouseSender();
    const sent = jsonBody<{ id: string }>(
      await sender
        .post(`/admin/bakehouse-resupplies/sites/${village}`)
        .send({ target: "asap", lines: [{ sku: article.sku, quantity: 6 }] })
        .expect(201),
    );

    expect((await listOf(agent, labo)).resupplies).toEqual([]);
    await agent.post(`/admin/site-resupplies/sites/${labo}/${id}/cancel`).expect(404);
    await agent.post(`/admin/site-resupplies/sites/${labo}/${sent.id}/cancel`).expect(404);
    const villageView = await listOf(agent, village);
    expect(villageView.resupplies.map((resupply) => resupply.status)).toEqual(["placed", "placed"]);
  });
});

describe("l'heure du réassort (lot R3a)", () => {
  it("« pour demain » est refusé après l'heure du réassort (409), « au plus tôt » passe", async () => {
    await resupplyCutoffAt("18:00");
    const agent = await counter();
    const siteId = await seedSite("Val Village");
    const article = await firstArticle(agent);
    const lines = [{ sku: article.sku, quantity: 3 }];

    const { sent: refused } = await counterSends(agent, siteId, "tomorrow", lines);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ code: "resupply.order.past_cutoff" });
    expect(JSON.stringify(refused.body)).toContain("la veille à 18:00");
    expect(JSON.stringify(refused.body)).toContain("Demandez au fournil");
    await counterSent(agent, siteId, "asap", lines);

    const view = await listOf(agent, siteId);
    expect(view.tomorrowOrderUntil).toBe("2026-09-08T16:00:00.000Z");
  });

  it("« pour demain » passe après l'heure limite générale, avant celle du réassort", async () => {
    await cutoffAtSixTheDayBefore();
    await resupplyCutoffAt("20:30");
    const agent = await counter();
    const siteId = await seedSite("Val Village");
    const article = await firstArticle(agent);

    await counterSent(agent, siteId, "tomorrow", [{ sku: article.sku, quantity: 3 }]);
    expect((await listOf(agent, siteId)).tomorrowOrderUntil).toBe("2026-09-08T18:30:00.000Z");
  });

  it("par défaut, la veille à 20:00 : « pour demain » passe à 20:00 pile", async () => {
    const agent = await counter();
    const siteId = await seedSite("Val Village");
    const article = await firstArticle(agent);

    await counterSent(agent, siteId, "tomorrow", [{ sku: article.sku, quantity: 3 }]);
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
      .post(`/admin/site-resupplies/sites/${siteId}/drafts/asap/lines`)
      .send({ sku: "VIE-001", quantity: 1 })
      .expect(403);

    const other = await holderOf("commandes-seules", [{ resource: "b2b_orders", action: "read" }]);
    await other.get(`/admin/site-resupplies/sites/${siteId}`).expect(403);
    await other.get("/admin/site-resupplies/to-produce").expect(403);
  });

  it("le fournil lit les réassorts à produire, sans les annulés ; le comptoir seul ne les lit pas", async () => {
    const agent = await counter();
    const village = await seedSite("Val Village");
    const article = await firstArticle(agent);
    await counterSent(agent, village, "asap", [{ sku: article.sku, quantity: 5 }]);
    const id = await counterSent(agent, village, "tomorrow", [{ sku: article.sku, quantity: 9 }]);
    await agent.post(`/admin/site-resupplies/sites/${village}/${id}/cancel`).expect(204);

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

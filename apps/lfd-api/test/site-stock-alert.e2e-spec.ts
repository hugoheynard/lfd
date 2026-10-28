/**
 * E2E des **alertes de stock du comptoir** (lot R1b de
 * `documentation/reassort-boutiques/plan-reapprovisionnement.md`, 2026-10-21).
 *
 * Ce qui ne s'éprouve qu'ici : l'index unique partiel (une alerte vivante par
 * point et article, une levée en garde la trace), le mur par point, les
 * droits du comptoir et du fournil, et la levée par la réception dans la
 * vraie transaction.
 */
import type {
  LiveStockAlertsView,
  ResupplyArticleView,
  SiteStockAlertsView,
  StockAlertView,
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

/** Une alerte ne se compare jamais à l'horloge : l'instant n'est que gelé. */
const MORNING = new Date("2026-09-08T07:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY = "2026-09-08";
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
  return holderOf("comptoir-alerte", [{ resource: "handover_counter", action: "write" }]);
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

async function alertsOf(agent: request.Agent, siteId: string): Promise<readonly StockAlertView[]> {
  return jsonBody<SiteStockAlertsView>(
    await agent.get(`/admin/site-stock-alerts/sites/${siteId}`).expect(200),
  ).alerts;
}

describe("déclarer et lever", () => {
  it("redéclarer change l'état ; lever garde la trace ; une nouvelle alerte peut suivre", async () => {
    const agent = await counter();
    const siteId = await seedSite("Val Village");
    const article = await firstArticle(agent);
    const route = `/admin/site-stock-alerts/sites/${siteId}`;

    await agent.post(route).send({ sku: article.sku, level: "low" }).expect(204);
    await agent.post(route).send({ sku: article.sku, level: "out_of_stock" }).expect(204);
    const [alert] = await alertsOf(agent, siteId);
    expect(alert).toMatchObject({ sku: article.sku, label: article.name, level: "out_of_stock" });
    expect(await ctx.prisma.siteStockAlert.count()).toBe(1);

    await agent.post(`${route}/${alert?.id ?? ""}/lift`).expect(204);
    await agent.post(`${route}/${alert?.id ?? ""}/lift`).expect(409);
    expect(await alertsOf(agent, siteId)).toEqual([]);

    await agent.post(route).send({ sku: article.sku, level: "low" }).expect(204);
    expect(await alertsOf(agent, siteId)).toHaveLength(1);
    // Pas de suppression : la levée reste, avec sa raison.
    const rows = await ctx.prisma.siteStockAlert.findMany({ orderBy: { declaredAt: "asc" } });
    expect(rows.map((row) => row.liftReason)).toEqual(["manual", null]);
  });

  it("refuse un niveau inconnu (400) et un article hors catalogue (404)", async () => {
    const agent = await counter();
    const siteId = await seedSite("Val Village");
    const route = `/admin/site-stock-alerts/sites/${siteId}`;

    await agent.post(route).send({ sku: "VIE-001", level: "vide" }).expect(400);
    await agent.post(route).send({ sku: "INCONNU-9", level: "low" }).expect(404);
    expect(await ctx.prisma.siteStockAlert.count()).toBe(0);
  });

  it("la base refuse une seconde alerte vivante pour le même point et article", async () => {
    const agent = await counter();
    const siteId = await seedSite("Val Village");
    const article = await firstArticle(agent);
    await agent
      .post(`/admin/site-stock-alerts/sites/${siteId}`)
      .send({ sku: article.sku, level: "low" })
      .expect(204);

    await expect(
      ctx.prisma.siteStockAlert.create({
        data: {
          id: "alert_doublon",
          siteId,
          sku: article.sku,
          label: article.name,
          level: "low",
          declaredAt: MORNING,
          declaredByStaffId: "s",
          declaredByName: "n",
          declaredByRole: "r",
        },
      }),
    ).rejects.toThrow();
  });

  it("ne tombe pas d'elle-même les jours suivants", async () => {
    const agent = await counter();
    const siteId = await seedSite("Val Village");
    const article = await firstArticle(agent);
    await agent
      .post(`/admin/site-stock-alerts/sites/${siteId}`)
      .send({ sku: article.sku, level: "out_of_stock" })
      .expect(204);

    clock.set(new Date(MORNING.getTime() + 3 * DAY_MS));

    expect(await alertsOf(agent, siteId)).toHaveLength(1);
  });
});

describe("la levée par la réception", () => {
  it("un article reçu au point lève son alerte, pas celle d'un autre point", async () => {
    const agent = await counter();
    const village = await seedSite("Val Village");
    const labo = await seedSite("Le Labo");
    const article = await firstArticle(agent);
    for (const siteId of [village, labo]) {
      await agent
        .post(`/admin/site-stock-alerts/sites/${siteId}`)
        .send({ sku: article.sku, level: "out_of_stock" })
        .expect(204);
    }

    await agent
      .post(`/admin/resupply-receipts/${village}/${DAY}/lines`)
      .send({ sku: article.sku, quantity: 6 })
      .expect(204);

    expect(await alertsOf(agent, village)).toEqual([]);
    expect(await alertsOf(agent, labo)).toHaveLength(1);
    const lifted = await ctx.prisma.siteStockAlert.findFirst({ where: { siteId: village } });
    expect(lifted?.liftReason).toBe("receipt");
  });
});

describe("le mur par point et les droits", () => {
  it("un point ne voit ni ne lève l'alerte d'un autre", async () => {
    const agent = await counter();
    const village = await seedSite("Val Village");
    const labo = await seedSite("Le Labo");
    const article = await firstArticle(agent);
    await agent
      .post(`/admin/site-stock-alerts/sites/${village}`)
      .send({ sku: article.sku, level: "low" })
      .expect(204);
    const [alert] = await alertsOf(agent, village);

    expect(await alertsOf(agent, labo)).toEqual([]);
    await agent.post(`/admin/site-stock-alerts/sites/${labo}/${alert?.id ?? ""}/lift`).expect(404);
    expect(await alertsOf(agent, village)).toHaveLength(1);
  });

  it("le comptoir en lecture ne déclare pas ; un autre métier ne lit rien", async () => {
    const siteId = await seedSite("Val Village");
    const reader = await holderOf("comptoir-lecture", [
      { resource: "handover_counter", action: "read" },
    ]);
    await reader.get(`/admin/site-stock-alerts/sites/${siteId}`).expect(200);
    await reader
      .post(`/admin/site-stock-alerts/sites/${siteId}`)
      .send({ sku: "VIE-001", level: "low" })
      .expect(403);

    const other = await holderOf("commandes-seules", [{ resource: "b2b_orders", action: "read" }]);
    await other.get(`/admin/site-stock-alerts/sites/${siteId}`).expect(403);
    await other.get("/admin/site-stock-alerts/live").expect(403);
  });

  it("le fournil lit les alertes vivantes de tous les points ; le comptoir seul ne les lit pas", async () => {
    const agent = await counter();
    const village = await seedSite("Val Village");
    const article = await firstArticle(agent);
    await agent
      .post(`/admin/site-stock-alerts/sites/${village}`)
      .send({ sku: article.sku, level: "out_of_stock" })
      .expect(204);

    await agent.get("/admin/site-stock-alerts/live").expect(403);
    const bakehouse = await holderOf("fournil", [
      { resource: "production_resupply", action: "read" },
    ]);
    const view = jsonBody<LiveStockAlertsView>(
      await bakehouse.get("/admin/site-stock-alerts/live").expect(200),
    );

    expect(view.sites).toEqual([
      {
        siteId: village,
        siteLabel: "Val Village",
        alerts: [expect.objectContaining({ sku: article.sku, level: "out_of_stock" })],
      },
    ]);
  });
});

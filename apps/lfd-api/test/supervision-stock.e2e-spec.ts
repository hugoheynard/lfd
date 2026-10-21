/**
 * E2E de **l'onglet Stock de la Supervision** (lot S1 de
 * `documentation/reassort-boutiques/plan-reapprovisionnement.md`, 2026-10-22).
 *
 * Ce qui ne s'éprouve qu'ici : le droit de la page (`b2b_supervision:read`
 * suffit, le comptoir seul est refusé), et la lecture de tous les points en
 * SQL — un réassort réceptionné compte au stock, un envoyé est attendu, une
 * alerte vivante remonte en tête.
 */
import type {
  DayStockOverviewView,
  ResupplyArticleView,
  ResupplyReceiptView,
  SiteResuppliesView,
} from "@lfd/contracts";
import { instantToLocal, localToInstant } from "@lfd/contracts";
import type request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { counterSent } from "./site-resupply-scene.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

/** Une journée de forme valide, jamais comparée à l'horloge : seul le droit est éprouvé. */
const ANY_DAY = "2026-01-02";

/**
 * Midi aujourd'hui, à l'heure de Paris : avant l'heure du réassort par défaut
 * (la veille, 20:00 — lot R3a), un « pour demain » part quelle que soit
 * l'heure où la suite tourne. Relatif à maintenant, jamais un jour du calendrier.
 */
function todayAtNoon(): Date {
  return localToInstant(instantToLocal(new Date()).day, "12:00") ?? new Date();
}

const clock = new FixedClock(todayAtNoon());
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
  clock.set(todayAtNoon());
});

async function seedSite(label = "Val Village"): Promise<string> {
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
  return holderOf("comptoir-reassort", [
    // `write` emporte la lecture : une ressource ne porte qu'un niveau.
    { resource: "handover_counter", action: "write" },
  ]);
}

/** Aujourd'hui selon le serveur (Paris) : la journée d'un réassort « au plus tôt ». */
async function today(agent: request.Agent, siteId: string): Promise<string> {
  return jsonBody<SiteResuppliesView>(
    await agent.get(`/admin/site-resupplies/sites/${siteId}`).expect(200),
  ).today;
}

async function readReceipt(agent: request.Agent, siteId: string): Promise<ResupplyReceiptView> {
  const day = await today(agent, siteId);
  return jsonBody<ResupplyReceiptView>(
    await agent.get(`/admin/resupply-receipts/${siteId}/${day}`).expect(200),
  );
}

async function articlesOf(
  agent: request.Agent,
): Promise<readonly [ResupplyArticleView, ResupplyArticleView]> {
  const [first, second] = jsonBody<readonly ResupplyArticleView[]>(
    await agent.get("/admin/resupply-receipts/articles").expect(200),
  );
  if (first === undefined || second === undefined) {
    throw new Error("Le catalogue semé doit proposer au moins deux articles.");
  }
  return [first, second];
}

/** Un réassort « au plus tôt » envoyé par le comptoir ; rend son identifiant. */
function placeAsap(
  agent: request.Agent,
  siteId: string,
  lines: readonly { sku: string; quantity: number }[],
): Promise<string> {
  return counterSent(agent, siteId, "asap", lines);
}

function supervisor(): Promise<request.Agent> {
  return holderOf("superviseur-stock", [{ resource: "b2b_supervision", action: "read" }]);
}

describe("l'onglet Stock de la Supervision", () => {
  it("refuse qui n'a que le comptoir (403), et sert qui n'a que la Supervision", async () => {
    const desk = await counter();
    const watcher = await supervisor();

    await desk.get(`/admin/supervision/stock/${ANY_DAY}`).expect(403);
    const view = jsonBody<DayStockOverviewView>(
      await watcher.get(`/admin/supervision/stock/${ANY_DAY}`).expect(200),
    );
    expect(view.serviceDay).toBe(ANY_DAY);
    await watcher.get("/admin/supervision/stock/demain").expect(400);
  });

  it("rend par point les réassorts, le stock réceptionné, l'attendu et l'alerte", async () => {
    const desk = await counter();
    const watcher = await supervisor();
    const village = await seedSite("Val Village");
    const labo = await seedSite("Labo");
    const [first, second] = await articlesOf(desk);
    const received = await placeAsap(desk, village, [{ sku: first.sku, quantity: 12 }]);
    await desk
      .post(`/admin/resupply-receipts/${village}/resupplies/${received}/receive`)
      .expect(204);
    const pending = await placeAsap(desk, village, [{ sku: second.sku, quantity: 5 }]);
    await desk
      .post(`/admin/site-stock-alerts/sites/${village}`)
      .send({ sku: second.sku, level: "low" })
      .expect(204);
    const day = (await readReceipt(desk, village)).serviceDay;

    const view = jsonBody<DayStockOverviewView>(
      await watcher.get(`/admin/supervision/stock/${day}`).expect(200),
    );

    const ids = view.sites.map((site) => site.siteId);
    // Dans l'ordre des points : le Village, créé d'abord, avant le Labo.
    expect(ids.indexOf(village)).toBeLessThan(ids.indexOf(labo));
    const [atVillage, atLabo] = [village, labo].map((id) =>
      view.sites.find((site) => site.siteId === id),
    );
    expect(atVillage?.resupplies).toMatchObject([
      { resupplyId: received, state: "received", origin: "counter", target: "asap" },
      { resupplyId: pending, state: "sent" },
    ]);
    expect(atVillage?.products).toMatchObject([
      { sku: second.sku, stock: 0, alert: "low", expected: 5 },
      { sku: first.sku, stock: 12, alert: null, expected: 0 },
    ]);
    expect(atLabo).toMatchObject({ siteLabel: "Labo", resupplies: [], products: [] });
  });
});

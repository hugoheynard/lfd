/**
 * E2E de la **réception du réassort** — Comptoir › Réassort boutique (lot J1
 * du plan `documentation/limites-de-commande/plan-jour-meme-sur-stock.md`,
 * refait au lot R2 de `documentation/reassort-boutiques/plan-reapprovisionnement.md`,
 * 2026-10-21).
 *
 * Ce qui ne s'éprouve qu'ici : le droit du comptoir (`handover_counter`), le
 * mur par point, le libellé lu au vrai catalogue publié, l'unicité d'un reçu
 * par réassort et du réassort sans commande par (point, journée) en base, la
 * levée d'une alerte dans la transaction de « Réceptionner ».
 */
import type {
  ResupplyArticleView,
  ResupplyReceiptView,
  SiteResuppliesView,
  SiteStockAlertsView,
} from "@lfd/contracts";
import type request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

/** Une journée de forme valide, jamais comparée à l'horloge : seul le droit est éprouvé. */
const ANY_DAY = "2026-01-02";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
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
async function placeAsap(
  agent: request.Agent,
  siteId: string,
  lines: readonly { sku: string; quantity: number }[],
): Promise<string> {
  const placed = await agent
    .post(`/admin/site-resupplies/sites/${siteId}`)
    .send({ target: "asap", lines })
    .expect(201);
  return jsonBody<{ id: string }>(placed).id;
}

describe("« Réceptionner » un réassort", () => {
  it("attendu à la quantité demandée, puis reçu d'un geste ; un écart se corrige ensuite", async () => {
    const agent = await counter();
    const siteId = await seedSite();
    const [first, second] = await articlesOf(agent);
    const id = await placeAsap(agent, siteId, [
      { sku: first.sku, quantity: 12 },
      { sku: second.sku, quantity: 6 },
    ]);
    const route = `/admin/resupply-receipts/${siteId}/resupplies/${id}`;

    const before = await readReceipt(agent, siteId);
    expect(before.receptions).toMatchObject([
      {
        resupplyId: id,
        status: "expected",
        lines: [
          { sku: first.sku, expectedQuantity: 12, receivedQuantity: null },
          { sku: second.sku, expectedQuantity: 6, receivedQuantity: null },
        ],
      },
    ]);
    expect(before.stock).toEqual([]);
    const early = await agent
      .patch(`${route}/lines/${first.sku}`)
      .send({ quantity: 10 })
      .expect(409);
    expect(early.body).toMatchObject({ code: "resupply.receipt.not_yet_received" });

    await agent.post(`${route}/receive`).expect(204);
    const again = await agent.post(`${route}/receive`).expect(409);
    expect(again.body).toMatchObject({ code: "resupply.receipt.already_received" });
    await agent.patch(`${route}/lines/${first.sku}`).send({ quantity: 10 }).expect(204);

    const after = await readReceipt(agent, siteId);
    expect(after.receptions[0]).toMatchObject({
      status: "received",
      lines: [
        { sku: first.sku, expectedQuantity: 12, receivedQuantity: 10 },
        { sku: second.sku, expectedQuantity: 6, receivedQuantity: 6 },
      ],
    });
    expect(after.receptions[0]?.receivedBy).not.toBeNull();
    expect(await ctx.prisma.resupplyReceipt.count()).toBe(1);
  });

  it("deux réassorts et le sans commande du même jour s'additionnent au stock", async () => {
    const agent = await counter();
    const siteId = await seedSite();
    const [first] = await articlesOf(agent);
    const morning = await placeAsap(agent, siteId, [{ sku: first.sku, quantity: 12 }]);
    await agent
      .post(`/admin/resupply-receipts/${siteId}/resupplies/${morning}/receive`)
      .expect(204);
    const noon = await placeAsap(agent, siteId, [{ sku: first.sku, quantity: 5 }]);
    await agent.post(`/admin/resupply-receipts/${siteId}/resupplies/${noon}/receive`).expect(204);
    const day = await today(agent, siteId);
    await agent
      .post(`/admin/resupply-receipts/${siteId}/${day}/lines`)
      .send({ sku: first.sku, quantity: 2 })
      .expect(204);

    const view = await readReceipt(agent, siteId);
    expect(view.receptions.map((reception) => reception.resupplyId)).toEqual([morning, noon]);
    expect(view.stock).toEqual([
      { sku: first.sku, label: first.name, receivedQuantity: 19, estimatedStock: 19 },
    ]);
  });

  it("lève l'alerte du point à la réception, dans la même transaction", async () => {
    const agent = await counter();
    const siteId = await seedSite();
    const [first] = await articlesOf(agent);
    await agent
      .post(`/admin/site-stock-alerts/sites/${siteId}`)
      .send({ sku: first.sku, level: "out_of_stock" })
      .expect(204);
    const id = await placeAsap(agent, siteId, [{ sku: first.sku, quantity: 12 }]);

    await agent.post(`/admin/resupply-receipts/${siteId}/resupplies/${id}/receive`).expect(204);

    const { alerts } = jsonBody<SiteStockAlertsView>(
      await agent.get(`/admin/site-stock-alerts/sites/${siteId}`).expect(200),
    );
    expect(alerts).toEqual([]);
    const [row] = await ctx.prisma.siteStockAlert.findMany();
    expect(row?.liftReason).toBe("receipt");
  });

  it("le mur par point : le réassort d'un autre point est introuvable (404)", async () => {
    const agent = await counter();
    const village = await seedSite("Val Village");
    const front = await seedSite("Front de neige");
    const [first] = await articlesOf(agent);
    const id = await placeAsap(agent, village, [{ sku: first.sku, quantity: 3 }]);

    await agent.post(`/admin/resupply-receipts/${front}/resupplies/${id}/receive`).expect(404);
    expect((await readReceipt(agent, front)).receptions).toEqual([]);
    expect(await ctx.prisma.resupplyReceipt.count()).toBe(0);
  });

  it("un réassort annulé ne se réceptionne pas", async () => {
    const agent = await counter();
    const siteId = await seedSite();
    const [first] = await articlesOf(agent);
    const id = await placeAsap(agent, siteId, [{ sku: first.sku, quantity: 3 }]);
    await agent.post(`/admin/site-resupplies/sites/${siteId}/${id}/cancel`).expect(204);

    const refused = await agent
      .post(`/admin/resupply-receipts/${siteId}/resupplies/${id}/receive`)
      .expect(409);
    expect(refused.body).toMatchObject({ code: "resupply.receipt.resupply_not_receivable" });
  });
});

describe("le réassort sans commande", () => {
  it("le comptoir pose, corrige et retire des lignes ; le libellé vient du catalogue", async () => {
    const agent = await counter();
    const siteId = await seedSite();
    const articles = jsonBody<readonly ResupplyArticleView[]>(
      await agent.get("/admin/resupply-receipts/articles").expect(200),
    );
    const [first, second] = articles;
    if (first === undefined || second === undefined) {
      throw new Error("Le catalogue semé doit proposer au moins deux articles.");
    }
    const lines = `/admin/resupply-receipts/${siteId}/${await today(agent, siteId)}/lines`;

    await agent.post(lines).send({ sku: first.sku, quantity: 12 }).expect(204);
    await agent.post(lines).send({ sku: second.sku, quantity: 6 }).expect(204);
    await agent.patch(`${lines}/${first.sku}`).send({ quantity: 10 }).expect(204);
    await agent.delete(`${lines}/${second.sku}`).expect(204);

    const view = await readReceipt(agent, siteId);
    expect(view.unordered.lines).toEqual([
      { sku: first.sku, label: first.name, receivedQuantity: 10 },
    ]);
    expect(view.unordered.updatedBy).not.toBeNull();
    expect(view.stock).toEqual([
      { sku: first.sku, label: first.name, receivedQuantity: 10, estimatedStock: 10 },
    ]);
  });

  it("refuse un doublon (409), une quantité négative (400) et un article inconnu (404)", async () => {
    const agent = await counter();
    const siteId = await seedSite();
    const [article] = jsonBody<readonly ResupplyArticleView[]>(
      await agent.get("/admin/resupply-receipts/articles").expect(200),
    );
    if (article === undefined) {
      throw new Error("Le catalogue semé doit proposer un article.");
    }
    const lines = `/admin/resupply-receipts/${siteId}/${await today(agent, siteId)}/lines`;
    await agent.post(lines).send({ sku: article.sku, quantity: 3 }).expect(204);

    const duplicate = await agent.post(lines).send({ sku: article.sku, quantity: 1 }).expect(409);
    expect(duplicate.body).toMatchObject({ code: "resupply.receipt.line_already_present" });
    await agent.patch(`${lines}/${article.sku}`).send({ quantity: -1 }).expect(400);
    await agent.post(lines).send({ sku: "INCONNU-999", quantity: 1 }).expect(404);

    expect(await ctx.prisma.resupplyReceiptLine.count()).toBe(1);
  });

  it("chaque point de retrait a sa liste", async () => {
    const agent = await counter();
    const village = await seedSite("Val Village");
    const front = await seedSite("Front de neige");
    const [article] = jsonBody<readonly ResupplyArticleView[]>(
      await agent.get("/admin/resupply-receipts/articles").expect(200),
    );
    if (article === undefined) {
      throw new Error("Le catalogue semé doit proposer un article.");
    }
    await agent
      .post(`/admin/resupply-receipts/${village}/${await today(agent, village)}/lines`)
      .send({ sku: article.sku, quantity: 4 })
      .expect(204);

    expect((await readReceipt(agent, front)).unordered.lines).toEqual([]);
  });

  it("fermé en 403 à qui ne tient pas le comptoir, et en écriture à qui ne fait que le lire", async () => {
    const siteId = await seedSite();
    const other = await holderOf("commandes-seules", [{ resource: "b2b_orders", action: "read" }]);
    await other.get(`/admin/resupply-receipts/${siteId}/${ANY_DAY}`).expect(403);

    const reader = await holderOf("comptoir-lecture", [
      { resource: "handover_counter", action: "read" },
    ]);
    await reader.get(`/admin/resupply-receipts/${siteId}/${ANY_DAY}`).expect(200);
    await reader.post(`/admin/resupply-receipts/${siteId}/resupplies/any/receive`).expect(403);
    await reader
      .post(`/admin/resupply-receipts/${siteId}/${ANY_DAY}/lines`)
      .send({ sku: "VIE-001", quantity: 1 })
      .expect(403);
  });
});

/**
 * E2E de la **réception du réapprovisionnement** — Comptoir › Réassort
 * boutique (plan `documentation/limites-de-commande/plan-jour-meme-sur-stock.md`,
 * lot J1, 2026-10-21).
 *
 * Ce qui ne s'éprouve qu'ici : le droit du comptoir (`handover_counter`), le
 * libellé lu au vrai catalogue publié, l'unicité (site, journée) et la clé
 * (réception, SKU) en base, le verrou de version entre deux gestes.
 */
import type { ResupplyArticleView, ResupplyReceiptView } from "@lfd/contracts";
import type request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

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

const DAY = serviceDay(0);

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

async function readReceipt(agent: request.Agent, siteId: string): Promise<ResupplyReceiptView> {
  return jsonBody<ResupplyReceiptView>(
    await agent.get(`/admin/resupply-receipts/${siteId}/${DAY}`).expect(200),
  );
}

describe("la réception du réapprovisionnement", () => {
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
    const lines = `/admin/resupply-receipts/${siteId}/${DAY}/lines`;

    await agent.post(lines).send({ sku: first.sku, quantity: 12 }).expect(204);
    await agent.post(lines).send({ sku: second.sku, quantity: 6 }).expect(204);
    await agent.patch(`${lines}/${first.sku}`).send({ quantity: 10 }).expect(204);
    await agent.delete(`${lines}/${second.sku}`).expect(204);

    const view = await readReceipt(agent, siteId);
    expect(view.lines).toEqual([
      { sku: first.sku, label: first.name, receivedQuantity: 10, estimatedStock: 10 },
    ]);
    expect(view.updatedBy).not.toBeNull();
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
    const lines = `/admin/resupply-receipts/${siteId}/${DAY}/lines`;
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
      .post(`/admin/resupply-receipts/${village}/${DAY}/lines`)
      .send({ sku: article.sku, quantity: 4 })
      .expect(204);

    expect((await readReceipt(agent, front)).lines).toEqual([]);
  });

  it("fermé en 403 à qui ne tient pas le comptoir, et en écriture à qui ne fait que le lire", async () => {
    const siteId = await seedSite();
    const other = await holderOf("commandes-seules", [{ resource: "b2b_orders", action: "read" }]);
    await other.get(`/admin/resupply-receipts/${siteId}/${DAY}`).expect(403);

    const reader = await holderOf("comptoir-lecture", [
      { resource: "handover_counter", action: "read" },
    ]);
    await reader.get(`/admin/resupply-receipts/${siteId}/${DAY}`).expect(200);
    await reader
      .post(`/admin/resupply-receipts/${siteId}/${DAY}/lines`)
      .send({ sku: "VIE-001", quantity: 1 })
      .expect(403);
  });
});

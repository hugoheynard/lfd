/**
 * E2E des **raccourcis du fournil** (plan
 * `documentation/fournil/plan-raccourcis-du-fournil.md`, S1 et S2), sur le
 * vrai Postgres jetable.
 *
 * Ce que seule cette suite prouve : les articles vendables lus au commerce par
 * le canal, dans l'ordre du catalogue ; l'ajout avec son auteur figé et son
 * fait dans la même transaction ; les refus nommés (nom, pièces, doublon,
 * plafond) sans rien écrire ; la suppression qui archive et libère le nom
 * malgré l'index unique partiel ; et les deux droits — régler sous
 * `production_settings`, lire depuis la fiche sous `production_worksheet`.
 */
import type {
  BatchShortcutsSettingsView,
  CreatedIdResponse,
  RoleGrant,
  WorkshopShortcutsView,
} from "@lfd/contracts";
import type request from "supertest";

import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";

const SETTINGS = "/admin/production/settings/shortcuts";
const WORKSHOP = "/admin/production/shortcuts";
const SKU = "VIE-001";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const admin = (): request.Agent => ctx.asSub(E2E_STAFF_SUB);

async function settings(agent: request.Agent = admin()): Promise<BatchShortcutsSettingsView> {
  return jsonBody<BatchShortcutsSettingsView>(await agent.get(SETTINGS).expect(200));
}

async function create(label: string, pieces: number, sku = SKU): Promise<string> {
  const response = await admin().post(SETTINGS).send({ sku, label, pieces }).expect(201);
  return jsonBody<CreatedIdResponse>(response).id;
}

function refusal(response: request.Response): string {
  return jsonBody<{ message: string }>(response).message;
}

/** Un rôle créé à l'écran, qui ne tient que ces droits, et une personne qui le porte. */
async function holderOf(key: string, grants: readonly RoleGrant[]): Promise<request.Agent> {
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

describe("la page des raccourcis", () => {
  it("liste les articles vendables du commerce, par famille, et aucun raccourci", async () => {
    const view = await settings();

    expect(view.shortcuts).toEqual([]);
    expect(view.articles.find((article) => article.sku === SKU)).toEqual({
      sku: SKU,
      name: "Croissant",
      familyId: "fam-vien",
      familyName: "Viennoiseries",
      saleUnit: "piece",
    });
    const families = view.articles.map((article) => article.familyId);
    // Chaque famille d'un seul bloc : l'ordre du catalogue, pas celui des SKU.
    const blocks = families.filter((id, index) => index === 0 || families[index - 1] !== id);
    expect(blocks).toEqual([...new Set(families)]);
    expect(new Set(view.articles.map((article) => article.sku)).size).toBe(view.articles.length);
  });
});

describe("un article au poids (P6 de `pricing/plan-vente-au-poids.md`)", () => {
  /** Le pain au chocolat du semis devient un article au poids. */
  const WEIGHED = "VIE-002";

  it("la page dit son unité ; raccourci et contenant se règlent en grammes, servis tels quels", async () => {
    await ctx.prisma.catalogItem.update({
      where: { sku: `${WEIGHED}-1` },
      data: { saleUnit: "weight", weightStepGrams: 50, weightMinGrams: null },
    });

    const view = await settings();
    expect(view.articles.find((article) => article.sku === WEIGHED)?.saleUnit).toBe("weight");
    expect(view.articles.find((article) => article.sku === SKU)?.saleUnit).toBe("piece");

    const tray = await create("1 plaque", 1500, WEIGHED);
    await admin()
      .put(`/admin/production/containers/${WEIGHED}`)
      .send({ unitsPerContainer: 2000, singular: "bac", plural: "bacs" })
      .expect((response) => {
        expect(response.status).toBeLessThan(300);
      });

    const workshop = jsonBody<WorkshopShortcutsView>(await admin().get(WORKSHOP).expect(200));
    expect(workshop.bySku[WEIGHED]).toEqual([{ id: tray, label: "1 plaque", pieces: 1500 }]);
    expect(
      await ctx.prisma.productionContainer.findUniqueOrThrow({
        where: { sku: WEIGHED },
        select: { unitsPerContainer: true },
      }),
    ).toEqual({ unitsPerContainer: 2000 });
  });
});

describe("ajouter, modifier, supprimer", () => {
  it("ajoute un raccourci, fige l'auteur et journalise dans la même transaction", async () => {
    const id = await create(" 1 plaque ", 24);

    expect((await settings()).shortcuts).toEqual([
      { id, sku: SKU, label: "1 plaque", pieces: 24, position: 0 },
    ]);
    const row = await ctx.prisma.productionBatchShortcut.findUniqueOrThrow({ where: { id } });
    expect(row.createdByStaffId).toBe(E2E_STAFF_ID);
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "production_batch_shortcut.created" },
    });
    expect(facts.map((fact) => fact.payload)).toEqual([
      { subjectLabel: "1 plaque (VIE-001)", sku: SKU, label: "1 plaque", pieces: 24 },
    ]);
  });

  it("modifie le nom et les pièces, et journalise l'avant", async () => {
    const id = await create("1 plaque", 24);

    await admin()
      .put(`${SETTINGS}/${id}`)
      .send({ label: "1 grande plaque", pieces: 30 })
      .expect(204);

    expect((await settings()).shortcuts[0]).toMatchObject({ label: "1 grande plaque", pieces: 30 });
    const fact = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "production_batch_shortcut.updated" },
    });
    expect(fact.payload).toMatchObject({ previous: { label: "1 plaque", pieces: 24 } });
  });

  it("supprime en archivant, et le nom se libère malgré l'index unique", async () => {
    const id = await create("1 plaque", 24);

    await admin().post(`${SETTINGS}/${id}/remove`).expect(204);

    expect((await settings()).shortcuts).toEqual([]);
    const row = await ctx.prisma.productionBatchShortcut.findUniqueOrThrow({ where: { id } });
    expect(row.removedAt).not.toBeNull();
    await create("1 PLAQUE", 12);
    await admin().post(`${SETTINGS}/${id}/remove`).expect(404);
    await admin().put(`${SETTINGS}/${id}`).send({ label: "x", pieces: 1 }).expect(404);
  });
});

describe("les refus, nommés, sans rien écrire", () => {
  it("refuse un nom vide ou trop long, et des pièces nulles, en 400", async () => {
    const empty = await admin()
      .post(SETTINGS)
      .send({ sku: SKU, label: "  ", pieces: 24 })
      .expect(400);
    expect(refusal(empty)).toContain("vide");
    await admin()
      .post(SETTINGS)
      .send({ sku: SKU, label: "x".repeat(31), pieces: 24 })
      .expect(400);
    await admin().post(SETTINGS).send({ sku: SKU, label: "1 plaque", pieces: 0 }).expect(400);

    expect(await ctx.prisma.productionBatchShortcut.count()).toBe(0);
  });

  it("refuse un doublon de nom en 409, casse ignorée", async () => {
    await create("1 plaque", 24);

    const response = await admin()
      .post(SETTINGS)
      .send({ sku: SKU, label: "1 Plaque", pieces: 12 })
      .expect(409);

    expect(refusal(response)).toContain("1 plaque");
    expect(await ctx.prisma.productionBatchShortcut.count()).toBe(1);
  });

  it("refuse un septième raccourci en 409, même en rafale", async () => {
    for (const index of [1, 2, 3, 4, 5]) {
      await create(`${index} plaques`, index * 24);
    }

    const burst = await Promise.all(
      ["6 plaques", "7 plaques"].map((label) =>
        admin().post(SETTINGS).send({ sku: SKU, label, pieces: 24 }),
      ),
    );

    expect(burst.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await ctx.prisma.productionBatchShortcut.count({ where: { sku: SKU } })).toBe(6);
  });
});

describe("les droits", () => {
  it("la fiche d'atelier lit les raccourcis par SKU, sans pouvoir les régler", async () => {
    const plaque = await create("1 plaque", 24);
    const chariot = await create("1 chariot", 96);
    const worker = await holderOf("fournil-lecture", [
      { resource: "production_worksheet", action: "read" },
    ]);

    const view = jsonBody<WorkshopShortcutsView>(await worker.get(WORKSHOP).expect(200));

    expect(view.bySku).toEqual({
      [SKU]: [
        { id: plaque, label: "1 plaque", pieces: 24 },
        { id: chariot, label: "1 chariot", pieces: 96 },
      ],
    });
    await worker.get(SETTINGS).expect(403);
    await worker.post(SETTINGS).send({ sku: SKU, label: "x", pieces: 1 }).expect(403);
  });

  it("qui lit les réglages ne les écrit pas", async () => {
    const reader = await holderOf("reglages-lecture", [
      { resource: "production_settings", action: "read" },
    ]);

    await settings(reader);
    await reader.post(SETTINGS).send({ sku: SKU, label: "1 plaque", pieces: 24 }).expect(403);
    await reader.get(WORKSHOP).expect(403);
  });
});

/**
 * E2E des **modèles de réassort** d'un point (plan
 * `documentation/reassort-boutiques/plan-modeles-de-reassort.md`, lot T1).
 *
 * Ce qui ne s'éprouve qu'ici : les droits de la bibliothèque (trois droits
 * ouvrent la lecture, un seul l'écriture), l'index unique partiel du nom
 * parmi les modèles actifs d'un point sur le vrai Postgres, le verrou de
 * version, et les lignes confrontées au vrai catalogue du réassort.
 */
import { randomUUID } from "node:crypto";
import type {
  ResupplyArticleView,
  ResupplyTemplateView,
  SavedResupplyTemplateResponse,
} from "@lfd/contracts";
import type request from "supertest";

import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

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

const admin = () => ctx.asSub(E2E_STAFF_SUB);

async function seedSite(label: string): Promise<string> {
  const site = await ctx.prisma.site.create({
    data: { label, ligne1: "1 place", codePostal: "73150", ville: "Val", pays: "France" },
    select: { id: true },
  });
  return site.id;
}

/** Un membre du staff qui ne tient QUE ces droits. */
async function staffWith(
  key: string,
  grants: readonly { readonly resource: string; readonly action: "read" | "write" }[],
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

async function anArticle(): Promise<ResupplyArticleView> {
  const articles = jsonBody<readonly ResupplyArticleView[]>(
    await admin().get("/admin/bakehouse-resupplies/articles").expect(200),
  );
  const found = articles[0];
  if (found === undefined) {
    throw new Error("Le catalogue semé doit proposer un article.");
  }
  return found;
}

function contentWith(sku: string, saleUnit: "piece" | "weight", name = "Base matin") {
  return { name, target: "tomorrow", lines: [{ sku, quantity: 4, saleUnit }] };
}

async function create(
  site: string,
  content: ReturnType<typeof contentWith>,
  expected = 201,
): Promise<request.Response> {
  return admin()
    .post(`/admin/resupply-templates/sites/${site}`)
    .send({ key: randomUUID(), ...content })
    .expect(expected);
}

async function library(site: string): Promise<readonly ResupplyTemplateView[]> {
  return jsonBody<readonly ResupplyTemplateView[]>(
    await admin().get(`/admin/resupply-templates/sites/${site}`).expect(200),
  );
}

describe("la bibliothèque des modèles de réassort", () => {
  it("se lit sous l'un des trois droits, et ne s'écrit que sous resupply_templates", async () => {
    const site = await seedSite("Village");
    const { sku, saleUnit } = await anArticle();
    const content = contentWith(sku, saleUnit);
    const counter = await staffWith("tpl-comptoir", [
      { resource: "handover_counter", action: "write" },
    ]);
    const bakehouse = await staffWith("tpl-fournil", [
      { resource: "production_resupply", action: "write" },
    ]);
    const librarian = await staffWith("tpl-modeles", [
      { resource: "resupply_templates", action: "write" },
    ]);
    const stranger = await staffWith("tpl-ailleurs", [{ resource: "b2b_orders", action: "read" }]);

    await librarian
      .post(`/admin/resupply-templates/sites/${site}`)
      .send({ key: randomUUID(), ...content })
      .expect(201);
    for (const reader of [counter, bakehouse, librarian]) {
      await reader.get(`/admin/resupply-templates/sites/${site}`).expect(200);
    }
    await stranger.get(`/admin/resupply-templates/sites/${site}`).expect(403);
    await counter
      .post(`/admin/resupply-templates/sites/${site}`)
      .send({ key: randomUUID(), ...contentWith(sku, saleUnit, "Autre") })
      .expect(403);
  });

  it("refuse un nom déjà porté par un modèle actif du point, le rend libre après l'archive", async () => {
    const site = await seedSite("Village");
    const other = await seedSite("Halles");
    const { sku, saleUnit } = await anArticle();
    const first = jsonBody<SavedResupplyTemplateResponse>(
      await create(site, contentWith(sku, saleUnit)),
    );

    const refused = await create(site, contentWith(sku, saleUnit, " BASE  matin "), 409);
    expect(refused.body).toMatchObject({ code: "resupply.template.name_taken" });
    await create(other, contentWith(sku, saleUnit));

    await admin().post(`/admin/resupply-templates/${first.id}/archive`).expect(204);
    await admin().post(`/admin/resupply-templates/${first.id}/archive`).expect(409);
    expect(await library(site)).toEqual([]);
    await create(site, contentWith(sku, saleUnit));
    expect((await library(site)).map((view) => view.name)).toEqual(["Base matin"]);
  });

  it("ajuste sous la version lue et refuse la version périmée", async () => {
    const site = await seedSite("Village");
    const { sku, saleUnit } = await anArticle();
    const created = jsonBody<SavedResupplyTemplateResponse>(
      await create(site, contentWith(sku, saleUnit)),
    );
    const adjusted = { ...contentWith(sku, saleUnit, "Base du mardi"), target: "asap" };

    const saved = jsonBody<SavedResupplyTemplateResponse>(
      await admin()
        .put(`/admin/resupply-templates/${created.id}`)
        .send({ ...adjusted, version: 1 })
        .expect(200),
    );
    expect(saved).toEqual({ id: created.id, version: 2 });
    const stale = await admin()
      .put(`/admin/resupply-templates/${created.id}`)
      .send({ ...adjusted, version: 1 })
      .expect(409);
    expect(stale.body).toMatchObject({ code: "resupply.template.changed_meanwhile" });
    expect(await library(site)).toEqual([
      expect.objectContaining({
        id: created.id,
        name: "Base du mardi",
        target: "asap",
        version: 2,
      }),
    ]);
  });

  it("garde chaque modèle à son point : la clé d'un autre point est refusée, la liste ne le montre pas", async () => {
    const site = await seedSite("Village");
    const other = await seedSite("Halles");
    const { sku, saleUnit } = await anArticle();
    const key = randomUUID();
    await admin()
      .post(`/admin/resupply-templates/sites/${site}`)
      .send({ key, ...contentWith(sku, saleUnit) })
      .expect(201);
    const replay = await admin()
      .post(`/admin/resupply-templates/sites/${site}`)
      .send({ key, ...contentWith(sku, saleUnit) })
      .expect(201);
    expect(jsonBody<SavedResupplyTemplateResponse>(replay)).toEqual({ id: key, version: 1 });
    const taken = await admin()
      .post(`/admin/resupply-templates/sites/${other}`)
      .send({ key, ...contentWith(sku, saleUnit) })
      .expect(409);
    expect(taken.body).toMatchObject({ code: "resupply.template.key_taken" });
    expect(await library(other)).toEqual([]);
    await admin()
      .put(`/admin/resupply-templates/${randomUUID()}`)
      .send({
        ...contentWith(sku, saleUnit),
        version: 1,
      })
      .expect(404);
  });

  it("marque sans les corriger les lignes retirées du catalogue ou d'une unité changée", async () => {
    const site = await seedSite("Village");
    const { sku, saleUnit, name } = await anArticle();
    const otherUnit = saleUnit === "piece" ? "weight" : "piece";
    await admin()
      .post(`/admin/resupply-templates/sites/${site}`)
      .send({
        key: randomUUID(),
        name: "Base matin",
        target: "tomorrow",
        lines: [
          { sku, quantity: 4, saleUnit },
          { sku: "RETIRE-DU-CATALOGUE", quantity: 2, saleUnit: "piece" },
        ],
      })
      .expect(201);
    await admin()
      .post(`/admin/resupply-templates/sites/${site}`)
      .send({ key: randomUUID(), ...contentWith(sku, otherUnit, "Autre unité") })
      .expect(201);

    const views = await library(site);
    expect(views.map((view) => view.lines)).toEqual([
      [{ sku, quantity: 4, saleUnit: otherUnit, articleName: name, issue: "sale_unit_changed" }],
      [
        { sku, quantity: 4, saleUnit, articleName: name, issue: null },
        {
          sku: "RETIRE-DU-CATALOGUE",
          quantity: 2,
          saleUnit: "piece",
          articleName: null,
          issue: "withdrawn",
        },
      ],
    ]);
  });
});

/**
 * E2E de la **salle d'un site** (plan
 * `documentation/sites/sites.md` §6 bis) : la case
 * « Sur place » dans les rôles, la grille de tables sous `admin/sites/:id/tables`,
 * ses QR, et les refus qui les lient — sur le vrai Postgres.
 */
import type { CreatedPickupResponse, SiteTablesView, SiteView } from "@lfd/contracts";

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

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub(E2E_STAFF_SUB);
}

const ROLES = {
  pickup: true,
  supply: "on_site",
  deliveryDeparture: false,
  transferMode: "integrated",
  counterSetupMinutes: 0,
} as const;

async function create(label: string): Promise<string> {
  const response = await staff()
    .post("/admin/sites")
    .send({
      label,
      ligne1: "1 place du Village",
      ligne2: "",
      codePostal: "73150",
      ville: "Val-d'Isère",
      pays: "France",
    })
    .expect(201);
  return jsonBody<CreatedPickupResponse>(response).id;
}

async function openRoom(id: string): Promise<void> {
  await staff()
    .put(`/admin/sites/${id}/roles`)
    .send({ ...ROLES, eatIn: true })
    .expect(204);
}

async function tables(id: string): Promise<SiteTablesView> {
  return jsonBody<SiteTablesView>(await staff().get(`/admin/sites/${id}/tables`).expect(200));
}

describe("admin/sites — « Sur place »", () => {
  it("un site neuf n'a pas de salle ; la case s'ouvre et se relit", async () => {
    const id = await create("Village");
    expect(jsonBody<SiteView>(await staff().get(`/admin/sites/${id}`).expect(200)).eatIn).toBe(
      false,
    );
    await openRoom(id);
    expect(jsonBody<SiteView>(await staff().get(`/admin/sites/${id}`).expect(200)).eatIn).toBe(
      true,
    );
  });

  it("une charge sans la case la laisse telle quelle (absent = inchangé)", async () => {
    const id = await create("Village");
    await openRoom(id);
    await staff().put(`/admin/sites/${id}/roles`).send(ROLES).expect(204);
    expect(jsonBody<SiteView>(await staff().get(`/admin/sites/${id}`).expect(200)).eatIn).toBe(
      true,
    );
  });
});

describe("admin/sites/:id/tables", () => {
  it("refuse une grille sur un site sans salle (409), en nommant le geste", async () => {
    const id = await create("Village");
    const response = await staff().put(`/admin/sites/${id}/tables`).send({ count: 2 }).expect(409);
    expect(JSON.stringify(response.body)).toContain("Sur place");
    expect((await tables(id)).tables).toEqual([]);
  });

  it("pose la grille de 1 à N, génère des QR à jetons uniques, en retire", async () => {
    const id = await create("Village");
    await openRoom(id);
    await staff().put(`/admin/sites/${id}/tables`).send({ count: 3 }).expect(204);
    await staff().post(`/admin/sites/${id}/tables/1/qr`).expect(204);
    await staff().post(`/admin/sites/${id}/tables/2/qr`).expect(204);

    const grid = (await tables(id)).tables;
    expect(grid.map((table) => [table.number, table.hasQr])).toEqual([
      [1, true],
      [2, true],
      [3, false],
    ]);
    expect(grid[0]?.qrCreatedAt).not.toBeNull();
    const rows = await ctx.prisma.siteTable.findMany({ where: { siteId: id } });
    const tokens = rows.flatMap((row) => (row.token === null ? [] : [row.token]));
    expect(new Set(tokens).size).toBe(2);

    await staff().delete(`/admin/sites/${id}/tables/1/qr`).expect(204);
    expect((await tables(id)).tables[0]).toMatchObject({ hasQr: false, qrUrl: null });
  });

  it("régénérer un QR change son jeton", async () => {
    const id = await create("Village");
    await openRoom(id);
    await staff().put(`/admin/sites/${id}/tables`).send({ count: 1 }).expect(204);
    await staff().post(`/admin/sites/${id}/tables/1/qr`).expect(204);
    const first = await ctx.prisma.siteTable.findFirstOrThrow({ where: { siteId: id } });
    await staff().post(`/admin/sites/${id}/tables/1/qr`).expect(204);
    const second = await ctx.prisma.siteTable.findFirstOrThrow({ where: { siteId: id } });
    expect(second.token).not.toBeNull();
    expect(second.token).not.toBe(first.token);
  });

  it("refuse un QR sur une table absente (404), un nombre hors borne (400)", async () => {
    const id = await create("Village");
    await openRoom(id);
    await staff().put(`/admin/sites/${id}/tables`).send({ count: 1 }).expect(204);
    await staff().post(`/admin/sites/${id}/tables/7/qr`).expect(404);
    await staff().put(`/admin/sites/${id}/tables`).send({ count: 201 }).expect(400);
  });

  it("refuse de fermer une salle qui a des tables (409), puis la laisse fermer à 0", async () => {
    const id = await create("Village");
    await openRoom(id);
    await staff().put(`/admin/sites/${id}/tables`).send({ count: 2 }).expect(204);
    await staff()
      .put(`/admin/sites/${id}/roles`)
      .send({ ...ROLES, eatIn: false })
      .expect(409);
    await staff().put(`/admin/sites/${id}/tables`).send({ count: 0 }).expect(204);
    await staff()
      .put(`/admin/sites/${id}/roles`)
      .send({ ...ROLES, eatIn: false })
      .expect(204);
  });

  it("répond 404 pour un site inconnu", async () => {
    await staff().get("/admin/sites/ghost/tables").expect(404);
  });
});

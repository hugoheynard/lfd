/**
 * E2E du **droit `allergen_matrix`** (Hugo, 2026-10-20 ; plan
 * `documentation/pim/plan-matrice-des-allergenes.md`, §2 « Droit ») : la
 * matrice a son droit à elle, et `pim_catalog` n'y suffit plus — lire la
 * matrice n'est pas rédiger une fiche. Les rôles sont posés en base, comme
 * la production les garde : la migration n'accorde rien.
 */
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";

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

type Grant = {
  readonly resource: "allergen_matrix" | "pim_catalog";
  readonly action: "read" | "write";
};

/** Un rôle tel que la base le garde, et une personne active qui le porte. */
async function holderOf(key: string, grants: readonly Grant[]): Promise<string> {
  await ctx.prisma.staffRoleDefinition.create({ data: { key, label: key, grants: [...grants] } });
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Léa",
      lastName: key,
      email: `${key}@lfc.test`,
      roleKey: key,
      role: null,
      status: "active",
      auth0Id: `sub-${key}`,
    },
  });
  return `sub-${key}`;
}

const ROUTES = ["/pim/allergen-matrix", "/pim/allergen-matrix.csv", "/pim/allergen-matrix.pdf"];

describe("le droit `allergen_matrix`", () => {
  it("en lecture seule, ouvre la matrice en JSON, en tableur et en PDF", async () => {
    const sub = await holderOf("matrice-lecture", [
      { resource: "allergen_matrix", action: "read" },
    ]);
    for (const route of ROUTES) {
      await ctx.asSub(sub).get(route).expect(200);
    }
  });

  it("n'ouvre pas les fiches pour autant", async () => {
    const sub = await holderOf("matrice-seule", [{ resource: "allergen_matrix", action: "read" }]);
    await ctx.asSub(sub).get("/pim/catalogue/products").expect(403);
  });
});

/** Une famille posée par le staff de semis, qui tient le catalogue. */
async function aFamily(name: string, parentId?: string): Promise<string> {
  const body = parentId === undefined ? { name: { fr: name } } : { name: { fr: name }, parentId };
  const created = await ctx.asSub(E2E_STAFF_SUB).post("/pim/catalogue/categories").send(body);
  expect(created.status).toBe(201);
  return jsonBody<{ id: string }>(created).id;
}

describe("la liste des familles du filtre (Hugo, 2026-10-20)", () => {
  /**
   * L'écran n'a que ce droit et ne lit pas l'arbre du catalogue : la matrice
   * le lui sert, mère sans fiche comprise, archivées exclues, quel que soit
   * le filtre.
   */
  it("vient avec la matrice sous le seul droit `allergen_matrix`", async () => {
    const mother = await aFamily("Pains");
    const daughter = await aFamily("Pains spéciaux", mother);
    const archived = await aFamily("Ancienne gamme");
    await ctx
      .asSub(E2E_STAFF_SUB)
      .put(`/pim/catalogue/categories/${archived}/archive`)
      .send({})
      .expect(200);
    const sub = await holderOf("matrice-familles", [
      { resource: "allergen_matrix", action: "read" },
    ]);

    const view = jsonBody<{
      familyChoices: { id: string; label: string; parentId: string | null; depth: number }[];
    }>(await ctx.asSub(sub).get(`/pim/allergen-matrix?categoryId=${daughter}`).expect(200));

    expect(view.familyChoices).toEqual([
      { id: mother, label: "Pains", parentId: null, depth: 0 },
      { id: daughter, label: "Pains spéciaux", parentId: mother, depth: 1 },
    ]);
  });
});

describe("le droit `pim_catalog` seul", () => {
  /** La matrice a quitté `pim_catalog` le 2026-10-20 (Hugo) : il ne l'ouvre plus. */
  it("est refusé sur les trois routes de la matrice, même en écriture", async () => {
    const sub = await holderOf("catalogue-seul", [{ resource: "pim_catalog", action: "write" }]);
    for (const route of ROUTES) {
      await ctx.asSub(sub).get(route).expect(403);
    }
  });
});

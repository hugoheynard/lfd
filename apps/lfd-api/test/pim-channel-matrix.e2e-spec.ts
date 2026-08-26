/**
 * E2E de la **matrice de canaux en table** — C0-d, tranche d-1.
 *
 * `channel_preset` et `channel_override` restent la source ; `category_channel`,
 * `product_channel_override` et `product_channel` sont écrites à côté, dans la
 * même transaction. Ce que ces cas prouvent, c'est que le miroir **suit** : la
 * bascule d-2 lira celui-ci, et un miroir qui dérive est pire qu'un miroir
 * absent — il donne une réponse fausse au lieu de pas de réponse.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const LOCATIONS = "/pim/locations";
const CATEGORIES = "/pim/catalogue/categories";
const PRODUCTS = "/pim/catalogue/products";

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

const staff = (): ReturnType<E2eContext["http"]> =>
  ctx.http().set("Authorization", "Bearer staff-e2e");

/** La sonde de parité passe par la porte machine-à-machine, pas par le staff. */
const ops = (): ReturnType<E2eContext["http"]> =>
  ctx.http().set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN);

async function aLocation(name: string): Promise<string> {
  const response = await staff()
    .post(LOCATIONS)
    .send({ name, clickCollect: true, eatIn: true, baseUrl: "", tableCount: 0 });
  expect(response.status).toBe(201);
  return jsonBody<{ id: string }>(response).id;
}

async function aCategory(nameFr: string): Promise<string> {
  const response = await staff()
    .post(CATEGORIES)
    .send({ name: { fr: nameFr } });
  expect(response.status).toBe(201);
  return jsonBody<{ id: string }>(response).id;
}

async function aProduct(categoryId: string, nameFr: string): Promise<string> {
  const response = await staff()
    .post(PRODUCTS)
    .send({ name: { fr: nameFr }, kind: "daily", categoryId });
  expect(response.status).toBe(201);
  return jsonBody<{ id: string }>(response).id;
}

/** Les paires écrites pour une famille, triées — « lieu:contexte », `—` = sans lieu. */
async function categoryPairs(categoryId: string): Promise<string[]> {
  const rows = await ctx.prisma.categoryChannel.findMany({ where: { categoryId } });
  return rows.map((row) => `${row.locationId ?? "—"}:${row.contextKey}`).sort();
}

async function productPairs(productId: string): Promise<string[]> {
  const rows = await ctx.prisma.productChannel.findMany({ where: { productId } });
  return rows.map((row) => `${row.locationId ?? "—"}:${row.contextKey}`).sort();
}

async function hasOverride(productId: string): Promise<boolean> {
  return (await ctx.prisma.productChannelOverride.findUnique({ where: { productId } })) !== null;
}

describe("ce qu'une famille vend s'écrit en paires (lieu, contexte)", () => {
  it("déplie un mode coché en une ligne", async () => {
    const location = await aLocation("Village");
    const category = await aCategory("Viennoiseries");

    await staff()
      .put(`${CATEGORIES}/${category}/channels`)
      .send([{ locationId: location, context: "emporter" }])
      .expect(200);

    expect(await categoryPairs(category)).toEqual([`${location}:emporter`]);
  });

  it("écrit DEUX lignes quand un lieu vend les deux modes", async () => {
    const location = await aLocation("Village");
    const category = await aCategory("Viennoiseries");

    await staff()
      .put(`${CATEGORIES}/${category}/channels`)
      .send([
        { locationId: location, context: "emporter" },
        { locationId: location, context: "surPlace" },
      ])
      .expect(200);

    expect(await categoryPairs(category)).toEqual([`${location}:emporter`, `${location}:surPlace`]);
  });

  /**
   * Le cas qui justifie la forme : le B2B n'a pas de lieu. `location_id` NULL
   * n'est pas une absence de donnée, c'est la donnée — on ne commande pas à une
   * boutique.
   */
  it("écrit le contexte SANS LIEU avec un location_id nul", async () => {
    const category = await aCategory("Viennoiseries");

    await staff()
      .put(`${CATEGORIES}/${category}/channels`)
      .send([{ locationId: null, context: "b2b" }])
      .expect(200);

    expect(await categoryPairs(category)).toEqual(["—:b2b"]);
  });

  it("RETIRE les lignes qu'on décoche", async () => {
    const location = await aLocation("Village");
    const category = await aCategory("Viennoiseries");
    const channels = (body: object) =>
      staff().put(`${CATEGORIES}/${category}/channels`).send(body).expect(200);

    await channels([
      { locationId: location, context: "emporter" },
      { locationId: location, context: "surPlace" },
      { locationId: null, context: "b2b" },
    ]);
    expect(await categoryPairs(category)).toHaveLength(3);

    await channels([{ locationId: location, context: "emporter" }]);
    expect(await categoryPairs(category)).toEqual([`${location}:emporter`]);

    await channels([]);
    expect(await categoryPairs(category)).toEqual([]);
  });
});

describe("la dérogation d'une fiche EXISTE avant de contenir quoi que ce soit", () => {
  it("n'écrit aucune ligne parente tant que la fiche hérite", async () => {
    const category = await aCategory("Viennoiseries");
    const product = await aProduct(category, "Croissant");

    expect(await hasOverride(product)).toBe(false);
  });

  /**
   * **Le cas qui a décidé de la forme.** « Déroge, et ne vend nulle part » et
   * « hérite de sa famille » seraient tous deux zéro cellule : c'est la ligne
   * parente, et elle seule, qui les distingue.
   */
  it("distingue « déroge sans rien vendre » de « hérite »", async () => {
    const category = await aCategory("Viennoiseries");
    const product = await aProduct(category, "Croissant");

    await staff().put(`${PRODUCTS}/${product}/channels`).send({ channels: [] }).expect(200);

    expect(await hasOverride(product)).toBe(true);
    expect(await productPairs(product)).toEqual([]);
  });

  it("écrit les cellules de la dérogation", async () => {
    const location = await aLocation("Village");
    const category = await aCategory("Viennoiseries");
    const product = await aProduct(category, "Croissant");
    await staff()
      .put(`${CATEGORIES}/${category}/channels`)
      .send([
        { locationId: location, context: "emporter" },
        { locationId: location, context: "surPlace" },
        { locationId: null, context: "b2b" },
      ])
      .expect(200);

    await staff()
      .put(`${PRODUCTS}/${product}/channels`)
      .send({
        channels: [
          { locationId: location, context: "emporter" },
          { locationId: null, context: "b2b" },
        ],
      })
      .expect(200);

    expect(await productPairs(product)).toEqual([`${location}:emporter`, "—:b2b"]);
  });

  /**
   * Rendre la fiche à sa famille emporte la ligne parente, et les cellules
   * partent avec elle par cascade. Aucune cellule ne peut survivre à la
   * dérogation qui la portait — c'est la base qui le garantit, pas le dépôt.
   */
  it("efface tout quand la fiche revient à l'héritage", async () => {
    const location = await aLocation("Village");
    const category = await aCategory("Viennoiseries");
    const product = await aProduct(category, "Croissant");
    await staff()
      .put(`${CATEGORIES}/${category}/channels`)
      .send([{ locationId: location, context: "emporter" }])
      .expect(200);
    await staff()
      .put(`${PRODUCTS}/${product}/channels`)
      .send({
        channels: [{ locationId: location, context: "emporter" }],
      })
      .expect(200);
    expect(await productPairs(product)).toHaveLength(1);

    await staff().put(`${PRODUCTS}/${product}/channels`).send({ channels: null }).expect(200);

    expect(await hasOverride(product)).toBe(false);
    expect(await productPairs(product)).toEqual([]);
  });
});

describe("le mur devient direct", () => {
  /**
   * `category_location_ref` portait le `Restrict` par procuration, faute de
   * pouvoir poser une clé étrangère dans du `jsonb`. `category_channel` le
   * contient désormais, avec le contexte en plus — la tranche d-3 supprime le
   * registre.
   */
  it("refuse de supprimer un emplacement encore vendu, depuis la table", async () => {
    const location = await aLocation("Village");
    const category = await aCategory("Viennoiseries");
    await staff()
      .put(`${CATEGORIES}/${category}/channels`)
      .send([{ locationId: location, context: "emporter" }])
      .expect(200);

    expect(await ctx.prisma.categoryChannel.count({ where: { locationId: location } })).toBe(1);

    const response = await staff().delete(`${LOCATIONS}/${location}`);
    expect(response.status).toBe(409);
  });
});

/**
 * La sonde de parité — le feu vert de la tranche d-3.
 *
 * Elle compare les deux écritures de la matrice : les colonnes `jsonb`
 * héritées, encore écrites, et les tables désormais lues. Un écart signifie que
 * supprimer les colonnes figerait la mauvaise vérité.
 */
describe("la sonde de parité des canaux", () => {
  const PARITY = "/pim/admin/channel-parity";

  it("ne trouve aucun écart sur ce que l'API vient d'écrire", async () => {
    const location = await aLocation("Village");
    const category = await aCategory("Viennoiseries");
    const product = await aProduct(category, "Croissant");
    await staff()
      .put(`${CATEGORIES}/${category}/channels`)
      .send([
        { locationId: location, context: "emporter" },
        { locationId: null, context: "b2b" },
      ])
      .expect(200);
    await staff()
      .put(`${PRODUCTS}/${product}/channels`)
      .send({ channels: [{ locationId: location, context: "surPlace" }] })
      .expect(200);

    const report = jsonBody<{
      identical: boolean;
      categoriesChecked: number;
      productsChecked: number;
    }>(await ops().get(PARITY).expect(200));

    expect(report.identical).toBe(true);
    expect(report.categoriesChecked).toBeGreaterThan(0);
    expect(report.productsChecked).toBeGreaterThan(0);
  });

  /**
   * Et elle DOIT voir un écart qu'on fabrique — sinon elle serait un feu vert
   * qui ne regarde rien, c'est-à-dire pire qu'aucun feu.
   */
  it("VOIT une divergence introduite directement en base", async () => {
    const location = await aLocation("Village");
    const category = await aCategory("Viennoiseries");
    await staff()
      .put(`${CATEGORIES}/${category}/channels`)
      .send([{ locationId: location, context: "emporter" }])
      .expect(200);

    // Ce que l'ancien binaire ferait dans la fenêtre : écrire la colonne seule.
    await ctx.prisma.category.update({
      where: { id: category },
      data: {
        channelPreset: {
          boutiques: { [location]: { emporter: true, surPlace: true } },
          b2b: false,
        },
      },
    });

    const report = jsonBody<{
      identical: boolean;
      categories: { id: string; onlyInColumn: string[] }[];
    }>(await ops().get(PARITY).expect(200));

    expect(report.identical).toBe(false);
    expect(report.categories).toEqual([
      { id: category, onlyInColumn: [`${location} surPlace`], onlyInTable: [] },
    ]);
  });
});

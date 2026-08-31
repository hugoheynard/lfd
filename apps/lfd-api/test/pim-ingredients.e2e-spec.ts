/**
 * E2E des **référentiels de provenance** — sur un vrai Postgres.
 *
 * Ce que seul ce niveau prouve : les deux `RESTRICT`. Une appellation citée par
 * un ingrédient, et un ingrédient cité par une fiche, ne s'effacent pas — et
 * c'est la clé étrangère qui tranche, pas un compte préalable. Un test unitaire
 * montrerait le refus du handler ; il ne montrerait pas que la base refuserait
 * de toute façon, ce qui est la seule garantie qui tienne sous concurrence.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const APPELLATIONS = "/pim/appellations";
const INGREDIENTS = "/pim/ingredients";
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

let categoryId: string | null = null;

beforeEach(async () => {
  await ctx.reset();
  categoryId = null;
});

const staff = (): ReturnType<E2eContext["http"]> =>
  ctx.http().set("Authorization", "Bearer staff-e2e");

interface AppellationRow {
  readonly code: string;
  readonly label: Record<string, string>;
  readonly scheme: string;
  readonly active: boolean;
  readonly usedBy: number;
}

interface IngredientRow {
  readonly key: string;
  readonly name: Record<string, string>;
  readonly description: Record<string, string> | null;
  readonly origin: string;
  readonly appellation: AppellationRow | null;
  readonly usedBy: number;
}

const appellations = async (): Promise<AppellationRow[]> =>
  jsonBody<AppellationRow[]>(await staff().get(APPELLATIONS).expect(200));

const ingredients = async (): Promise<IngredientRow[]> =>
  jsonBody<IngredientRow[]>(await staff().get(INGREDIENTS).expect(200));

async function anAppellation(code = "aop-beaufort"): Promise<string> {
  const response = await staff()
    .post(APPELLATIONS)
    .send({ code, label: { fr: "Beaufort" }, scheme: "AOP" });
  expect(response.status).toBe(201);
  return code;
}

async function anIngredient(
  key = "beurre-de-savoie",
  appellationCode: string | null = null,
): Promise<string> {
  const response = await staff()
    .post(INGREDIENTS)
    .send({
      key,
      name: { fr: "Beurre de Savoie" },
      origin: "Savoie, France",
      appellationCode,
    });
  expect(response.status).toBe(201);
  return key;
}

/** La famille du test courant — une seule, son slug étant unique. */
async function aCategory(): Promise<string> {
  if (categoryId === null) {
    const response = await staff()
      .post(CATEGORIES)
      .send({ name: { fr: "Viennoiseries" } });
    expect(response.status).toBe(201);
    categoryId = jsonBody<{ id: string }>(response).id;
  }
  return categoryId;
}

async function aProduct(): Promise<string> {
  const created = await staff()
    .post(PRODUCTS)
    .send({ name: { fr: "Croissant" }, kind: "daily", categoryId: await aCategory() });
  expect(created.status).toBe(201);
  return jsonBody<{ id: string }>(created).id;
}

describe("le référentiel des appellations", () => {
  it("ouvre une appellation en service, et la rend par son code", async () => {
    await anAppellation();

    expect(await appellations()).toEqual([
      { code: "aop-beaufort", label: { fr: "Beaufort" }, scheme: "AOP", active: true, usedBy: 0 },
    ]);
  });

  it("refuse un second code identique", async () => {
    await anAppellation();

    const again = await staff()
      .post(APPELLATIONS)
      .send({ code: "aop-beaufort", label: { fr: "Autre" }, scheme: "AOP" });

    expect(again.status).toBe(409);
  });

  it("traduit le libellé sans toucher au code", async () => {
    await anAppellation();

    await staff()
      .put(`${APPELLATIONS}/aop-beaufort`)
      .send({ label: { fr: "Beaufort", it: "Beaufort" } })
      .expect(200);

    expect((await appellations())[0]).toMatchObject({
      code: "aop-beaufort",
      label: { fr: "Beaufort", it: "Beaufort" },
    });
  });
});

describe("les deux murs de suppression", () => {
  /**
   * Le refus vient de la clé étrangère, pas d'un compte lu avant l'ordre : un
   * compte laisserait l'intervalle pendant lequel un ingrédient se met à citer
   * l'appellation.
   */
  it("refuse d'effacer une appellation qu'un ingrédient porte", async () => {
    const code = await anAppellation();
    await anIngredient("beurre-de-savoie", code);

    const removed = await staff().delete(`${APPELLATIONS}/${code}`);

    expect(removed.status).toBe(409);
    expect((await appellations())[0]?.usedBy).toBe(1);
  });

  it("laisse effacer une appellation que plus rien ne porte", async () => {
    const code = await anAppellation();

    await staff().delete(`${APPELLATIONS}/${code}`).expect(200);

    expect(await appellations()).toEqual([]);
  });

  it("refuse d'effacer un ingrédient qu'une fiche cite", async () => {
    const key = await anIngredient();
    const productId = await aProduct();
    await staff()
      .put(`/pim/products/${productId}/ingredients`)
      .send({ keys: [key] })
      .expect(200);

    const removed = await staff().delete(`${INGREDIENTS}/${key}`);

    expect(removed.status).toBe(409);
    expect((await ingredients())[0]?.usedBy).toBe(1);
  });
});

describe("ce qu'une fiche cite", () => {
  it("garde l'ORDRE reçu — c'est une décision éditoriale", async () => {
    const beurre = await anIngredient("beurre-de-savoie");
    const farine = await anIngredient("farine-de-meule");
    const productId = await aProduct();

    await staff()
      .put(`/pim/products/${productId}/ingredients`)
      .send({ keys: [farine, beurre] })
      .expect(200);

    const cited = jsonBody<IngredientRow[]>(
      await staff().get(`/pim/products/${productId}/ingredients`).expect(200),
    );
    expect(cited.map((row) => row.key)).toEqual([farine, beurre]);
  });

  it("résout l'appellation dans la lecture — l'écran n'a pas à la re-chercher", async () => {
    const code = await anAppellation();
    const key = await anIngredient("beurre-de-savoie", code);
    const productId = await aProduct();
    await staff()
      .put(`/pim/products/${productId}/ingredients`)
      .send({ keys: [key] })
      .expect(200);

    const cited = jsonBody<IngredientRow[]>(
      await staff().get(`/pim/products/${productId}/ingredients`).expect(200),
    );
    expect(cited[0]?.appellation).toMatchObject({ code, scheme: "AOP" });
  });

  it("remplace la liste entière, y compris par le vide", async () => {
    const key = await anIngredient();
    const productId = await aProduct();
    await staff()
      .put(`/pim/products/${productId}/ingredients`)
      .send({ keys: [key] })
      .expect(200);

    await staff().put(`/pim/products/${productId}/ingredients`).send({ keys: [] }).expect(200);

    const cited = jsonBody<IngredientRow[]>(
      await staff().get(`/pim/products/${productId}/ingredients`).expect(200),
    );
    expect(cited).toEqual([]);
  });

  it("refuse une clé qui ne désigne aucun ingrédient", async () => {
    const productId = await aProduct();

    const response = await staff()
      .put(`/pim/products/${productId}/ingredients`)
      .send({ keys: ["fantome"] });

    expect(response.status).toBe(404);
  });
});

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
  readonly allergens: string[];
  readonly usedBy: number;
}

interface VariantGapRow {
  readonly variantId: string;
  readonly declaredAllergens: string[] | null;
  readonly citedNotDeclared: string[];
}

interface CitedAllergensRow {
  readonly productId: string;
  readonly citedByIngredients: string[];
  readonly variants: VariantGapRow[];
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

/** La déclinaison par défaut, celle qui porte la fiche réglementaire. */
async function defaultVariant(productId: string): Promise<string> {
  const detail = await staff().get(`${PRODUCTS}/${productId}`).expect(200);
  const variantId = jsonBody<{ variants: { id: string }[] }>(detail).variants[0]?.id;
  if (variantId === undefined) {
    throw new Error("le produit est né sans déclinaison par défaut");
  }
  return variantId;
}

const citedAllergens = async (productId: string): Promise<CitedAllergensRow> =>
  jsonBody<CitedAllergensRow>(
    await staff().get(`/pim/products/${productId}/ingredient-allergens`).expect(200),
  );

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

/**
 * **Ce qu'un ingrédient contient** — contre le référentiel SEMÉ par la
 * migration, pas contre une constante.
 *
 * Ce que seul ce niveau prouve : les codes GS1 sont bien en table, la liaison
 * les rattache par identifiant, et la clé étrangère `Cascade` emporte les
 * liaisons d'une matière effacée — trois choses qu'un double en mémoire ne peut
 * qu'imiter.
 */
describe("les allergènes d'un ingrédient", () => {
  const setAllergens = (key: string, codes: readonly string[]) =>
    staff().put(`${INGREDIENTS}/${key}/allergens`).send({ codes });

  it("pose des codes du référentiel et les rend avec la matière", async () => {
    const key = await anIngredient("praline");

    await setAllergens(key, ["SH", "UW"]).expect(200);

    expect((await ingredients())[0]?.allergens).toEqual(["SH", "UW"]);
  });

  // D4 : le périmètre de la matière est `world`. Un ingrédient énonce un fait —
  // une farine qui contient du sarrasin en contient, que l'Europe l'exige ou
  // non — et le filtre européen appartient à la déclaration, pas à la matière.
  it("accepte un code hors obligation UE", async () => {
    const key = await anIngredient("farine-de-sarrasin");

    await setAllergens(key, ["BWD"]).expect(200);

    expect((await ingredients())[0]?.allergens).toEqual(["BWD"]);
  });

  it("refuse un code que la table ne porte pas", async () => {
    const key = await anIngredient("praline");

    const refus = await setAllergens(key, ["ZZZZ"]);

    expect(refus.status).toBe(400);
    expect(jsonBody<{ code: string }>(refus).code).toBe("catalogue.ingredient.allergen_unknown");
  });

  it("remplace la liste entière, y compris par le vide", async () => {
    const key = await anIngredient("praline");
    await setAllergens(key, ["SH", "UW"]).expect(200);

    await setAllergens(key, []).expect(200);

    expect((await ingredients())[0]?.allergens).toEqual([]);
  });

  /**
   * `Cascade` côté ingrédient : ses déclarations n'ont plus d'objet quand il
   * disparaît. Sans elle, la clé étrangère refuserait l'effacement d'une
   * matière que plus aucune fiche ne cite — et l'écran ne pourrait plus jamais
   * la retirer du référentiel.
   */
  it("laisse effacer une matière qui porte des allergènes", async () => {
    const key = await anIngredient("praline");
    await setAllergens(key, ["SH"]).expect(200);

    await staff().delete(`${INGREDIENTS}/${key}`).expect(200);

    expect(await ingredients()).toEqual([]);
  });
});

/**
 * **L'ensemble dérivé (D5)** — il propose, la déclaration décide.
 *
 * ⚠️ Une proposition vide ne dit RIEN : la liste d'ingrédients est éditoriale,
 * et rien n'y garantit l'exhaustivité. Ces tests figent ce que l'API rend, pas
 * une quelconque conformité de la fiche.
 */
describe("ce que la composition d'une fiche mentionne", () => {
  it("unit les codes des ingrédients cités, sans doublon", async () => {
    const praline = await anIngredient("praline");
    const nougat = await anIngredient("nougat");
    await staff()
      .put(`${INGREDIENTS}/${praline}/allergens`)
      .send({ codes: ["SH", "UW"] });
    await staff()
      .put(`${INGREDIENTS}/${nougat}/allergens`)
      .send({ codes: ["SH"] });
    const productId = await aProduct();
    await staff()
      .put(`/pim/products/${productId}/ingredients`)
      .send({ keys: [praline, nougat] })
      .expect(200);

    expect((await citedAllergens(productId)).citedByIngredients).toEqual(["SH", "UW"]);
  });

  // Sans fiche déclarée, il n'y a rien à reprendre : fabriquer une mention
  // réglementaire depuis une liste éditoriale est le geste que l'avertissement
  // de `Ingredient` interdit.
  it("ne propose rien à une déclinaison sans fiche", async () => {
    const praline = await anIngredient("praline");
    await staff()
      .put(`${INGREDIENTS}/${praline}/allergens`)
      .send({ codes: ["SH"] });
    const productId = await aProduct();
    await staff()
      .put(`/pim/products/${productId}/ingredients`)
      .send({ keys: [praline] })
      .expect(200);

    const view = await citedAllergens(productId);

    expect(view.variants).toEqual([
      { variantId: await defaultVariant(productId), declaredAllergens: null, citedNotDeclared: [] },
    ]);
    expect(view.citedByIngredients).toEqual(["SH"]);
  });

  it("propose ce que la composition mentionne et que la fiche ne déclare pas", async () => {
    const praline = await anIngredient("praline");
    await staff()
      .put(`${INGREDIENTS}/${praline}/allergens`)
      .send({ codes: ["SH", "UW"] });
    const productId = await aProduct();
    const variantId = await defaultVariant(productId);
    await staff()
      .put(`/pim/products/${productId}/ingredients`)
      .send({ keys: [praline] })
      .expect(200);
    await staff()
      .put(`${PRODUCTS}/${productId}/variants/${variantId}/nutrition`)
      .send({ allergens: ["UW"] })
      .expect(200);

    expect((await citedAllergens(productId)).variants).toEqual([
      { variantId, declaredAllergens: ["UW"], citedNotDeclared: ["SH"] },
    ]);
  });

  // Le dérivé ne RETIRE jamais : un allergène déclaré à la main — une
  // contamination croisée d'atelier — n'est pas contredit par une composition
  // éditoriale qui l'ignore.
  it("ne propose jamais de retirer ce que la fiche déclare en plus", async () => {
    const praline = await anIngredient("praline");
    await staff()
      .put(`${INGREDIENTS}/${praline}/allergens`)
      .send({ codes: ["SH"] });
    const productId = await aProduct();
    const variantId = await defaultVariant(productId);
    await staff()
      .put(`/pim/products/${productId}/ingredients`)
      .send({ keys: [praline] })
      .expect(200);
    await staff()
      .put(`${PRODUCTS}/${productId}/variants/${variantId}/nutrition`)
      .send({ allergens: ["SH", "BWD"] })
      .expect(200);

    expect((await citedAllergens(productId)).variants).toEqual([
      { variantId, declaredAllergens: ["SH", "BWD"], citedNotDeclared: [] },
    ]);
  });
});

/**
 * E2E — **la matrice des allergènes**, sur un vrai Postgres (plan
 * `documentation/pim/plan-matrice-des-allergenes.md`, lot AM1).
 *
 * Ce que seul ce niveau prouve : la matrice lit ce que la base a recollé —
 * deux tables pour une déclaration, un drapeau d'alignement, le référentiel
 * administrable et son italien semé — et pas ce qu'un double lui tend.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { makeActivatable } from "./pim-sellable.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const PRODUCTS = "/pim/catalogue/products";
const CATEGORIES = "/pim/catalogue/categories";
const MATRIX = "/pim/allergen-matrix";

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
  ctx.http().set("Authorization", `Bearer ${E2E_STAFF_SUB}`);

interface Cell {
  readonly category: string;
  readonly presence: string;
  readonly contains: readonly string[];
  readonly traces: readonly string[];
}
interface Row {
  readonly variantId: string;
  readonly state: string;
  readonly cells: readonly Cell[];
  readonly others: { readonly presence: string; readonly contains: readonly Other[] } | null;
}
interface Other {
  readonly code: string;
  readonly label: string;
  readonly official: boolean;
}
interface Matrix {
  readonly lastModifiedAt: string | null;
  readonly columns: readonly { readonly category: string; readonly label: string }[];
  readonly families: readonly { readonly id: string; readonly rows: readonly Row[] }[];
  readonly mentionsTranslated: boolean;
}

async function matrix(query = ""): Promise<Matrix> {
  return jsonBody<Matrix>(await staff().get(`${MATRIX}${query}`).expect(200));
}

function rows(view: Matrix): readonly Row[] {
  return view.families.flatMap((family) => family.rows);
}

function rowOf(view: Matrix, variantId: string): Row | undefined {
  return rows(view).find((row) => row.variantId === variantId);
}

/** Une fiche vendable, sa déclinaison par défaut — rien de déclaré. */
async function aProduct(suffix: string): Promise<{ productId: string; defaultId: string }> {
  const family = await staff()
    .post(CATEGORIES)
    .send({ name: { fr: `Viennoiseries${suffix}` } })
    .expect(201);
  const created = await staff()
    .post(PRODUCTS)
    .send({
      name: { fr: `Croissant${suffix}` },
      kind: "daily",
      categoryId: jsonBody<{ id: string }>(family).id,
    })
    .expect(201);
  const productId = jsonBody<{ id: string }>(created).id;
  await makeActivatable(staff, productId);
  const detail = jsonBody<{ variants: { id: string }[] }>(
    await staff().get(`${PRODUCTS}/${productId}`).expect(200),
  );
  return { productId, defaultId: detail.variants[0]?.id ?? "" };
}

async function declare(
  productId: string,
  variantId: string,
  allergens: readonly string[],
  mayContain: readonly string[] = [],
): Promise<void> {
  await staff()
    .put(`${PRODUCTS}/${productId}/variants/${variantId}/allergens`)
    .send({ allergens, mayContain })
    .expect(200);
}

async function publish(productId: string): Promise<void> {
  await staff().put(`${PRODUCTS}/${productId}/publish`).send({}).expect(200);
}

/** Une seconde déclinaison, DÉTACHÉE des allergènes du défaut. */
async function aDetachedVariant(productId: string): Promise<string> {
  const added = await staff()
    .post(`${PRODUCTS}/${productId}/variants`)
    .send({ name: { fr: "Boîte de 6" }, options: { format: "6" } })
    .expect(201);
  const id = jsonBody<{ id: string }>(added).id;
  const detached = await staff()
    .put(`${PRODUCTS}/${productId}/variants/${id}/alignment`)
    .send({ aspect: "allergens", aligned: false });
  expect([200, 204]).toContain(detached.status);
  return id;
}

describe("GET /pim/allergen-matrix", () => {
  it("rend les quatorze catégories de l'annexe II, en italien semé", async () => {
    const view = await matrix("?locale=it");
    expect(view.columns).toHaveLength(14);
    expect(view.columns[0]).toEqual({ category: "gluten", label: "Cereali contenenti glutine" });
    expect(view.mentionsTranslated).toBe(true);
  });

  it("non renseigné n'est pas « aucun », et une trace n'est pas une présence", async () => {
    const { productId, defaultId } = await aProduct("-a");
    await declare(productId, defaultId, ["UW"], ["AM"]);
    const undeclared = await aDetachedVariant(productId);
    await publish(productId);

    const view = await matrix();
    const declared = rowOf(view, defaultId);
    expect(declared?.state).toBe("declared");
    expect(declared?.cells.find((c) => c.category === "gluten")).toEqual({
      category: "gluten",
      presence: "contains",
      contains: ["Blé"],
      traces: [],
    });
    expect(declared?.cells.find((c) => c.category === "milk")?.presence).toBe("traces");
    expect(rowOf(view, undeclared)).toMatchObject({ state: "not_declared", cells: [] });

    await declare(productId, undeclared, []);
    expect(rowOf(await matrix(), undeclared)?.state).toBe("none_declared");
  });

  it("le sarrasin se nomme dans « Autres », et la matrice dit sa fraîcheur", async () => {
    const { productId, defaultId } = await aProduct("-s");
    await declare(productId, defaultId, ["BWD"]);
    await publish(productId);

    const view = await matrix();
    const row = rowOf(view, defaultId);
    expect(row?.state).toBe("declared");
    expect(row?.others?.presence).toBe("contains");
    expect(row?.others?.contains).toEqual([{ code: "BWD", label: "Sarrasin", official: true }]);
    expect(view.lastModifiedAt).not.toBeNull();
  });

  it("une déclinaison alignée porte la déclaration du défaut", async () => {
    const { productId, defaultId } = await aProduct("-b");
    await declare(productId, defaultId, ["AE"]);
    const added = await staff()
      .post(`${PRODUCTS}/${productId}/variants`)
      .send({ name: { fr: "Boîte de 6" }, options: { format: "6" } })
      .expect(201);
    await publish(productId);

    const row = rowOf(await matrix(), jsonBody<{ id: string }>(added).id);
    expect(row?.state).toBe("declared");
    expect(row?.cells.find((c) => c.category === "eggs")?.presence).toBe("contains");
  });

  it("un code d'une catégorie maison archivée rend la ligne « à revoir »", async () => {
    const category = jsonBody<{ id: string }>(
      await staff()
        .post("/pim/allergens/categories")
        .send({ key: "maison-matrice", name: { fr: "Maison" } })
        .expect(201),
    ).id;
    const entry = jsonBody<{ id: string }>(
      await staff()
        .post("/pim/allergens/entries")
        .send({ code: "MAISONMX", name: { fr: "Maison" }, categoryId: category })
        .expect(201),
    ).id;
    const { productId, defaultId } = await aProduct("-c");
    await declare(productId, defaultId, ["MAISONMX"]);
    await publish(productId);
    await staff().put(`/pim/allergens/entries/${entry}/archive`).expect(200);
    await staff().put(`/pim/allergens/categories/${category}/archive`).expect(200);

    const view = await matrix();
    expect(view.columns.map((c) => c.category)).not.toContain("maison-matrice");
    expect(rowOf(view, defaultId)).toMatchObject({ state: "to_review" });
    expect(rowOf(view, defaultId)?.cells).toHaveLength(14);
  });

  it("ne montre un brouillon que sur « tous », et jamais un archivé", async () => {
    const { productId, defaultId } = await aProduct("-d");
    expect(rowOf(await matrix(), defaultId)).toBeUndefined();
    expect(rowOf(await matrix("?scope=all"), defaultId)?.state).toBe("not_declared");
    expect(rowOf(await matrix("?scope=all&includeUndeclared=false"), defaultId)).toBeUndefined();

    const archived = await staff().put(`${PRODUCTS}/${productId}/archive`).send({});
    expect([200, 204]).toContain(archived.status);
    expect(rowOf(await matrix("?scope=all"), defaultId)).toBeUndefined();
  });

  it("refuse un paramètre mal formé, et une famille inconnue", async () => {
    await staff().get(`${MATRIX}?locale=de`).expect(400);
    await staff().get(`${MATRIX}?categoryId=cat_inconnue`).expect(404);
  });

  it("est murée : sans jeton, rien", async () => {
    await ctx.http().get(MATRIX).expect(401);
  });
});

describe("GET /pim/allergen-matrix.csv", () => {
  it("sert le tableur, en pièce jointe", async () => {
    const { productId, defaultId } = await aProduct("-e");
    await declare(productId, defaultId, ["UW"], ["AM"]);
    await publish(productId);

    const response = await staff().get(`${MATRIX}.csv`).expect(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain("matrice-allergenes-fr.csv");
    expect(response.text).toContain('"Croissant-e";"";');
    expect(response.text).toContain('"contient : Blé"');
    expect(response.text).toContain('"traces"');
  });
});

/**
 * E2E des **lectures allégées du référentiel** (P1 du plan des lectures du
 * PIM) — sur un vrai Postgres.
 *
 * Ce que seul ce niveau prouve : que les lectures en une requête (constats
 * rendus par la liste, constats d'une seule fiche, vue d'ensemble comptée par
 * agrégat) disent la même chose que les chemins complets qu'elles remplacent.
 */

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const CATEGORIES = "/pim/catalogue/categories";
const PRODUCTS = "/pim/catalogue/products";
const WARNINGS = `${PRODUCTS}/compliance-warnings`;
const OVERVIEW = "/pim/catalogue/revisions/overview";

interface WarningView {
  readonly productId: string;
  readonly warnings: readonly { readonly code: string }[];
}

interface ListRow {
  readonly id: string;
  readonly complianceWarnings: readonly { readonly code: string }[];
}

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

async function aCategory(nameFr: string): Promise<string> {
  const response = await staff()
    .post(CATEGORIES)
    .send({ name: { fr: nameFr } });
  expect(response.status).toBe(201);
  return jsonBody<{ id: string }>(response).id;
}

async function aProduct(nameFr: string, categoryId: string): Promise<string> {
  const created = await staff()
    .post(PRODUCTS)
    .set(INTENT_KEY, freshIntent())
    .send({ name: { fr: nameFr }, kind: "daily", categoryId });
  expect(created.status).toBe(201);
  return jsonBody<{ id: string }>(created).id;
}

describe("les constats de conformité, lus avec la liste", () => {
  it("rend dans chaque ligne de la liste les constats de compliance-warnings", async () => {
    const family = await aCategory("Viennoiseries");
    const first = await aProduct("Croissant", family);
    const second = await aProduct("Pain au chocolat", family);

    const rows = jsonBody<ListRow[]>(await staff().get(PRODUCTS).expect(200));
    const views = jsonBody<WarningView[]>(await staff().get(WARNINGS).expect(200));

    for (const id of [first, second]) {
      const fromList = rows.find((row) => row.id === id)?.complianceWarnings;
      const fromRoute = views.find((view) => view.productId === id)?.warnings ?? [];
      expect(fromList).toEqual(fromRoute);
      expect(fromList?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("rend les constats d'une seule fiche par ?productId=", async () => {
    const family = await aCategory("Viennoiseries");
    const first = await aProduct("Croissant", family);
    await aProduct("Pain au chocolat", family);

    const all = jsonBody<WarningView[]>(await staff().get(WARNINGS).expect(200));
    const one = jsonBody<WarningView[]>(
      await staff().get(WARNINGS).query({ productId: first }).expect(200),
    );

    expect(one).toEqual(all.filter((view) => view.productId === first));
  });

  it("répond 404 pour une fiche inconnue plutôt que de la dire conforme", async () => {
    await staff().get(WARNINGS).query({ productId: "prd_inconnu" }).expect(404);
  });

  it("ne juge pas une fiche archivée, ni dans la liste ni seule", async () => {
    const productId = await aProduct("Croissant", await aCategory("Viennoiseries"));
    await staff().put(`${PRODUCTS}/${productId}/archive`).send({}).expect(200);

    const rows = jsonBody<ListRow[]>(await staff().get(PRODUCTS).expect(200));
    expect(rows.find((row) => row.id === productId)?.complianceWarnings).toEqual([]);
    expect(jsonBody<unknown>(await staff().get(WARNINGS).query({ productId }).expect(200))).toEqual(
      [],
    );
  });
});

describe("la vue d'ensemble, comptée par agrégat", () => {
  it("compte les fiches vivantes, chaque déclinaison comme un article, sans l'archivée", async () => {
    const family = await aCategory("Viennoiseries");
    const croissant = await aProduct("Croissant", family);
    await aProduct("Pain au chocolat", family);
    const archived = await aProduct("Chausson", family);
    await staff()
      .post(`${PRODUCTS}/${croissant}/variants`)
      .set(INTENT_KEY, freshIntent())
      .send({ name: { fr: "Mini" } })
      .expect(201);
    await staff().put(`${PRODUCTS}/${archived}/archive`).send({}).expect(200);

    const overview = jsonBody<Record<string, number>>(await staff().get(OVERVIEW).expect(200));

    expect(overview).toEqual({ products: 2, published: 0, drafts: 2, signed: 0, articles: 3 });
  });
});

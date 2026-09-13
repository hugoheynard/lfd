/**
 * E2E du **renommage d'une déclinaison** — sur un vrai Postgres.
 *
 * Le verbe manquait entièrement, et son absence était invisible : la création
 * DEMANDE un nom, la base le gardait, `projection.ts` le poussait aux canaux —
 * et aucun écran ne le rendait ni ne permettait de le corriger. Une faute de
 * frappe dans « Boîte de 220 g » était définitive, y compris sur la déclinaison
 * par défaut, dont le nom est figé à la création de la fiche et que renommer le
 * PRODUIT ne touche pas (`update-product-identity` appelle `product.rename`, et
 * lui seul — vérifié le 2026-09-13).
 *
 * Ce que seul ce niveau prouve : le nom **relu**. Un test de handler dit ce que
 * l'agrégat a fait ; celui-ci dit ce que la base a gardé, et c'est la question
 * qu'on pose ici — la colonne existait déjà dans l'`update` du dépôt, mais rien
 * n'y écrivait jamais autre chose que la valeur de création.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

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

interface Detail {
  readonly variants: readonly {
    readonly id: string;
    readonly sku: string;
    readonly isDefault: boolean;
    readonly name: Record<string, string>;
  }[];
}

/**
 * Une fiche, sous sa propre famille.
 *
 * Le suffixe n'est pas de la décoration : le nom d'une famille est unique, et
 * deux appels sans lui se refusaient mutuellement en `409` — un test rouge qui
 * ne parlait pas du tout du renommage.
 */
async function aProduct(suffix = ""): Promise<string> {
  const category = await staff()
    .post(CATEGORIES)
    .send({ name: { fr: `Viennoiseries${suffix}` } });
  expect(category.status).toBe(201);
  const product = await staff()
    .post(PRODUCTS)
    .send({
      name: { fr: `Croissant${suffix}` },
      kind: "daily",
      categoryId: jsonBody<{ id: string }>(category).id,
    });
  expect(product.status).toBe(201);
  return jsonBody<{ id: string }>(product).id;
}

/** Les déclinaisons **relues**, jamais celles qu'on espérait. */
async function variantsOf(id: string): Promise<Detail["variants"]> {
  const response = await staff().get(`${PRODUCTS}/${id}`);
  expect(response.status).toBe(200);
  return jsonBody<Detail>(response).variants;
}

describe("Renommer une déclinaison", () => {
  it("garde le nouveau nom après relecture", async () => {
    const id = await aProduct();
    const added = await staff()
      .post(`${PRODUCTS}/${id}/variants`)
      .send({ name: { fr: "Boîte de 220 g" } });
    expect(added.status).toBe(201);
    const variantId = jsonBody<{ id: string }>(added).id;

    const renamed = await staff()
      .put(`${PRODUCTS}/${id}/variants/${variantId}/name`)
      .send({ name: { fr: "Boîte de 250 g" } });
    expect(renamed.status).toBe(200);

    const variant = (await variantsOf(id)).find((entry) => entry.id === variantId);
    expect(variant?.name["fr"]).toBe("Boîte de 250 g");
  });

  /**
   * 🔴 La RÉFÉRENCE ne suit pas le nom. Elle est dictée au laboratoire et sert
   * de clé de rapprochement dans les envois vers les canaux : la faire bouger
   * ferait entrer un article neuf à chaque correction de libellé, et sortir
   * l'ancien de la vente. `lint:sku-never-recycled` tient l'autre moitié de la
   * règle — qu'un SKU ne se réattribue jamais.
   */
  it("ne touche pas à la référence", async () => {
    const id = await aProduct();
    const added = await staff()
      .post(`${PRODUCTS}/${id}/variants`)
      .send({ name: { fr: "Boîte de 220 g" } });
    const variantId = jsonBody<{ id: string }>(added).id;
    const before = (await variantsOf(id)).find((entry) => entry.id === variantId)?.sku;

    await staff()
      .put(`${PRODUCTS}/${id}/variants/${variantId}/name`)
      .send({ name: { fr: "Tout autre chose" } });

    expect((await variantsOf(id)).find((entry) => entry.id === variantId)?.sku).toBe(before);
  });

  /**
   * La déclinaison par DÉFAUT se renomme aussi, et c'est le cas qui manquait le
   * plus : son nom est copié du produit à la création et rien ne le rattrape
   * ensuite — renommer la fiche laisse l'article s'appeler comme avant, et
   * c'est ce nom-là qui part au canal.
   */
  it("renomme aussi la déclinaison par défaut", async () => {
    const id = await aProduct();
    const variant = (await variantsOf(id)).find((entry) => entry.isDefault);
    expect(variant?.name["fr"]).toBe("Croissant");

    const renamed = await staff()
      .put(`${PRODUCTS}/${id}/variants/${variant?.id ?? ""}/name`)
      .send({ name: { fr: "Croissant au beurre" } });
    expect(renamed.status).toBe(200);

    expect((await variantsOf(id)).find((entry) => entry.isDefault)?.name["fr"]).toBe(
      "Croissant au beurre",
    );
  });

  /**
   * L'agrégat refuse la déclinaison d'une AUTRE fiche : sans lui, une requête
   * forgée sur le seul identifiant de déclinaison renommerait l'article d'un
   * produit qu'on n'a jamais ouvert.
   */
  it("refuse la déclinaison d’un autre produit", async () => {
    const mine = await aProduct(" A");
    const other = await aProduct(" B");
    const stranger = (await variantsOf(other)).find((entry) => entry.isDefault);

    const response = await staff()
      .put(`${PRODUCTS}/${mine}/variants/${stranger?.id ?? ""}/name`)
      .send({ name: { fr: "Volé" } });

    expect(response.status).toBe(404);
    expect((await variantsOf(other)).find((entry) => entry.isDefault)?.name["fr"]).toBe(
      "Croissant B",
    );
  });

  it("refuse un nom vide", async () => {
    const id = await aProduct();
    const variant = (await variantsOf(id)).find((entry) => entry.isDefault);

    const response = await staff()
      .put(`${PRODUCTS}/${id}/variants/${variant?.id ?? ""}/name`)
      .send({ name: { fr: "   " } });

    expect(response.status).toBe(400);
  });
});

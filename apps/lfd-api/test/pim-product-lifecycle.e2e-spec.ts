/**
 * E2E du **cycle de vie d'une fiche produit** — sur un vrai Postgres.
 *
 * Ce fichier existe à cause d'une panne que rien ne voyait. Le back-office
 * routait « Restaurer » vers la route de DÉPUBLICATION, que l'agrégat ignorait
 * en silence sur un produit archivé. Trois lectures concordaient sur un succès :
 * l'écran peignait « Brouillon » (il posait l'état espéré sans le relire), le
 * journal enregistrait un retrait de la vente, et l'API rendait 200. Seule la
 * base disait non — et comme la liste produits n'offre pas la restauration,
 * archiver était devenu irréversible depuis l'interface (audit 2026-09-01, §1).
 *
 * Ce que seul ce niveau prouve : **l'état APRÈS relecture**. Un test de handler
 * vérifie ce que l'agrégat a fait ; celui-ci vérifie ce que la base a gardé, et
 * c'est exactement là que la panne vivait.
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
  readonly status: string;
  readonly variants: readonly { readonly id: string; readonly isDefault: boolean }[];
}

async function aProduct(): Promise<string> {
  const category = await staff()
    .post(CATEGORIES)
    .send({ name: { fr: "Viennoiseries" } });
  expect(category.status).toBe(201);
  const product = await staff()
    .post(PRODUCTS)
    .send({
      name: { fr: "Croissant" },
      kind: "daily",
      categoryId: jsonBody<{ id: string }>(category).id,
    });
  expect(product.status).toBe(201);
  return jsonBody<{ id: string }>(product).id;
}

/** L'état **relu**, jamais celui qu'on espérait — c'est tout l'objet du fichier. */
async function statusOf(id: string): Promise<string> {
  const response = await staff().get(`${PRODUCTS}/${id}`);
  expect(response.status).toBe(200);
  return jsonBody<Detail>(response).status;
}

/** Invariant 7 : pas de mise en vente sans fiche réglementaire sur chaque déclinaison. */
async function aPublishableProduct(): Promise<string> {
  const id = await aProduct();
  const detail = jsonBody<Detail>(await staff().get(`${PRODUCTS}/${id}`));
  const variant = detail.variants.find((entry) => entry.isDefault);
  const declared = await staff()
    .put(`${PRODUCTS}/${id}/variants/${variant?.id ?? ""}/nutrition`)
    // `[]` est une AFFIRMATION — « aucun allergène » — pas une absence de réponse.
    .send({ allergens: [] });
  expect(declared.status).toBe(200);
  return id;
}

describe("Le cycle de vie d’une fiche", () => {
  it("naît en brouillon", async () => {
    expect(await statusOf(await aProduct())).toBe("draft");
  });

  it("se met en vente, puis se retire", async () => {
    const id = await aPublishableProduct();

    expect((await staff().put(`${PRODUCTS}/${id}/publish`).send({})).status).toBe(200);
    expect(await statusOf(id)).toBe("published");

    expect((await staff().put(`${PRODUCTS}/${id}/unpublish`).send({})).status).toBe(200);
    expect(await statusOf(id)).toBe("draft");
  });

  describe("l’archivage et son retour", () => {
    /**
     * 🔴 LE test de non-régression du §1. Il échoue sur le code d'avant : la
     * restauration partait sur `/unpublish`, qui rendait 200 sans rien écrire.
     */
    it("restaure vraiment — l’état RELU redevient brouillon", async () => {
      const id = await aProduct();
      expect((await staff().put(`${PRODUCTS}/${id}/archive`).send({})).status).toBe(200);
      expect(await statusOf(id)).toBe("archived");

      expect((await staff().put(`${PRODUCTS}/${id}/restore`).send({})).status).toBe(200);

      expect(await statusOf(id)).toBe("draft");
    });

    /**
     * La route par laquelle passait la restauration. Elle rendait 200 et
     * laissait la fiche archivée : c'est ce succès muet qui a rendu la panne
     * invisible pendant tout ce temps. Elle refuse maintenant, et le message
     * nomme le geste attendu.
     */
    it("REFUSE de retirer de la vente un produit archivé", async () => {
      const id = await aProduct();
      expect((await staff().put(`${PRODUCTS}/${id}/archive`).send({})).status).toBe(200);

      const response = await staff().put(`${PRODUCTS}/${id}/unpublish`).send({});

      expect(response.status).toBe(409);
      expect(jsonBody<{ message: string }>(response).message).toContain("Restaurer");
      expect(await statusOf(id)).toBe("archived");
    });

    /**
     * Régression : `restore()` posait `draft` sans regarder d'où il venait. Un
     * produit EN LIGNE qu'on « restaurait » sortait donc de la vente en silence.
     */
    it("REFUSE de restaurer un produit qui n’est pas archivé", async () => {
      const id = await aPublishableProduct();
      expect((await staff().put(`${PRODUCTS}/${id}/publish`).send({})).status).toBe(200);

      expect((await staff().put(`${PRODUCTS}/${id}/restore`).send({})).status).toBe(409);

      expect(await statusOf(id)).toBe("published");
    });

    it("un archivé ne se met pas en vente d’un geste : il se restaure d’abord", async () => {
      const id = await aPublishableProduct();
      expect((await staff().put(`${PRODUCTS}/${id}/archive`).send({})).status).toBe(200);

      expect((await staff().put(`${PRODUCTS}/${id}/publish`).send({})).status).toBe(409);
      expect(await statusOf(id)).toBe("archived");
    });

    /** L'archivage en lot repasse sur ce qui l'est déjà : il reste idempotent. */
    it("archiver deux fois reste accepté", async () => {
      const id = await aProduct();

      expect((await staff().put(`${PRODUCTS}/${id}/archive`).send({})).status).toBe(200);
      expect((await staff().put(`${PRODUCTS}/${id}/archive`).send({})).status).toBe(200);

      expect(await statusOf(id)).toBe("archived");
    });
  });
});

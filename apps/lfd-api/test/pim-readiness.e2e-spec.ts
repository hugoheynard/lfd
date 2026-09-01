/**
 * E2E de la **déclaration « publiable »** — sur un vrai Postgres.
 *
 * Ce que seul ce niveau prouve, et c'est tout l'objet du fichier : la
 * péremption. La signature ne s'invalide pas en écriture — elle se compare, en
 * lecture, à la dernière modification du contenu. Cette date est un `max` sur
 * QUATRE tables, et une table oubliée dans ce `max` ne casse rien : elle rend
 * simplement une fiche modifiée « toujours publiable ». C'est un défaut muet,
 * donc il lui faut un test qui touche chaque table, une par une.
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
  readonly readiness: { readonly readyAt: string; readonly readyBy: string } | null;
  readonly readinessStale: boolean;
  readonly contentUpdatedAt: string;
  readonly categoryId: string;
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

async function detail(id: string): Promise<Detail> {
  const response = await staff().get(`${PRODUCTS}/${id}`);
  expect(response.status).toBe(200);
  return jsonBody<Detail>(response);
}

async function declareReady(id: string): Promise<string> {
  const response = await staff().put(`${PRODUCTS}/${id}/ready`).send({});
  expect(response.status).toBe(200);
  return jsonBody<{ readyAt: string }>(response).readyAt;
}

/**
 * La signature est-elle périmée ? **La réponse du serveur**, plus une règle que
 * ce fichier rejouerait.
 *
 * Elle était recalculée ici (`readyAt < contentUpdatedAt`) — la même comparaison
 * que l'écran, donc les mêmes angles morts : le test ne pouvait pas voir que la
 * date de contenu comptait un changement de STATUT et ratait les taux. Un test
 * qui réimplémente la règle ne teste que sa propre copie (audit 2026-09-01).
 */
function isStale(view: Detail): boolean {
  return view.readinessStale;
}

describe("Déclaration publiable", () => {
  it("inscrit la signature, et la rend au geste qui la pose", async () => {
    const id = await aProduct();

    const readyAt = await declareReady(id);
    const view = await detail(id);

    expect(view.readiness).toEqual({ readyAt, readyBy: E2E_STAFF_SUB });
    expect(isStale(view)).toBe(false);
  });

  it("ne se prononce sur rien tant que personne n’a signé", async () => {
    const view = await detail(await aProduct());

    expect(view.readiness).toBeNull();
    // La date du contenu existe TOUJOURS, elle : une fiche est datée dès sa
    // création, même si personne ne s'est encore prononcé sur elle.
    expect(view.contentUpdatedAt).not.toBe("");
  });

  it("ne touche pas au statut : une fiche signée reste un brouillon", async () => {
    const id = await aProduct();

    await declareReady(id);

    expect(jsonBody<{ status: string }>(await staff().get(`${PRODUCTS}/${id}`)).status).toBe(
      "draft",
    );
  });

  /**
   * Les quatre tables, une par une. Chaque cas signe, modifie UNE table, et
   * vérifie que la signature est périmée — c'est la garantie que le `max` de
   * `PrismaReadinessRepository.contentUpdatedAt` ne perd personne en route.
   */
  describe("se périme quand la fiche bouge", () => {
    it("sur le socle (product) — l’identité", async () => {
      const id = await aProduct();
      await declareReady(id);

      const before = await detail(id);
      const response = await staff()
        .put(`${PRODUCTS}/${id}/identity`)
        .send({ name: { fr: "Pain au chocolat" }, kind: "daily", categoryId: before.categoryId });
      expect(response.status).toBe(200);

      const after = await detail(id);
      expect(after.contentUpdatedAt > before.contentUpdatedAt).toBe(true);
      expect(isStale(after)).toBe(true);
    });

    it("sur une déclinaison (product_variant) — le prix", async () => {
      const id = await aProduct();
      const variant = (await detail(id)).variants.find((entry) => entry.isDefault);
      await declareReady(id);

      const response = await staff()
        .put(`${PRODUCTS}/${id}/variants/${variant?.id ?? ""}/pricing`)
        .send({ priceCents: 1_200, priceBasis: "ttc", weightGrams: null });
      expect(response.status).toBe(200);

      expect(isStale(await detail(id))).toBe(true);
    });

    it("sur l’éditorial (product_editorial) — la description", async () => {
      const id = await aProduct();
      await declareReady(id);

      const response = await staff()
        .put(`${PRODUCTS}/${id}/editorial`)
        .send({ descriptionShort: { fr: "Pur beurre" } });
      expect(response.status).toBe(200);

      expect(isStale(await detail(id))).toBe(true);
    });

    it("sur les visuels (product_media) — une photo", async () => {
      const id = await aProduct();
      await declareReady(id);

      const response = await staff()
        .put(`${PRODUCTS}/${id}/media`)
        .send({ media: [{ role: "gallery", url: "https://cdn.test/croissant.jpg" }] });
      expect(response.status).toBe(200);

      // Le cas qui a motivé la colonne `updated_at` sur `product_media` : sans
      // elle, changer la photo laissait la signature se dire à jour.
      expect(isStale(await detail(id))).toBe(true);
    });

    /**
     * Régression : les canaux vivent dans `ProductChannelOverride`, une table
     * satellite que le `max` d'horodatages ne regardait pas. Fermer un canal —
     * donc retirer la fiche d'un contexte de vente — ne périmait rien
     * (audit 2026-09-01, §6).
     */
    it("sur les canaux, que le max d’horodatages ne voyait pas", async () => {
      const id = await aProduct();
      await declareReady(id);

      const response = await staff()
        .put(`${PRODUCTS}/${id}/channels`)
        .send({ channels: [{ pointOfSaleId: "pos_b2b", context: "b2b" }] });
      expect(response.status).toBe(200);

      expect(isStale(await detail(id))).toBe(true);
    });
  });

  /**
   * L'autre moitié du défaut, et la plus retorse : la date de contenu venait de
   * `product.updated_at`, un `@updatedAt` posé sur la ligne qui porte `status`.
   * **Mettre en vente périmait donc la signature qui justifiait la mise en
   * vente**, et l'écran affichait « la fiche a été modifiée depuis » sur une
   * fiche dont pas un caractère n'avait bougé (audit 2026-09-01, §6).
   */
  describe("ne se périme PAS sur un changement de statut", () => {
    async function aPublishableProduct(): Promise<string> {
      const id = await aProduct();
      const variant = (await detail(id)).variants.find((entry) => entry.isDefault);
      // Invariant 7 : pas de mise en vente sans fiche réglementaire. `[]` est
      // une affirmation — « aucun allergène » — pas une absence de réponse.
      const declared = await staff()
        .put(`${PRODUCTS}/${id}/variants/${variant?.id ?? ""}/nutrition`)
        .send({ allergens: [] });
      expect(declared.status).toBe(200);
      return id;
    }

    it("mettre en vente ne périme pas la signature qui l’autorisait", async () => {
      const id = await aPublishableProduct();
      await declareReady(id);

      expect((await staff().put(`${PRODUCTS}/${id}/publish`).send({})).status).toBe(200);

      const after = await detail(id);
      expect(after.status).toBe("published");
      expect(isStale(after)).toBe(false);
    });

    it("retirer de la vente non plus", async () => {
      const id = await aPublishableProduct();
      expect((await staff().put(`${PRODUCTS}/${id}/publish`).send({})).status).toBe(200);
      await declareReady(id);

      expect((await staff().put(`${PRODUCTS}/${id}/unpublish`).send({})).status).toBe(200);

      expect(isStale(await detail(id))).toBe(false);
    });

    it("ni l’archivage, ni la restauration", async () => {
      const id = await aProduct();
      await declareReady(id);

      expect((await staff().put(`${PRODUCTS}/${id}/archive`).send({})).status).toBe(200);
      expect((await staff().put(`${PRODUCTS}/${id}/restore`).send({})).status).toBe(200);

      expect(isStale(await detail(id))).toBe(false);
    });
  });
});

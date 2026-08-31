/**
 * E2E du **drapeau de publication** — le mur qui ferme ce qui sort.
 *
 * Ce que seul ce niveau prouve : que le refus est posé par le SERVEUR, sur les
 * routes réelles, et qu'il ne déborde pas. Un écran qui cache ses boutons ne
 * prouve rien — une requête recopiée depuis l'onglet réseau publierait quand
 * même. Et un mur trop large serait pire que pas de mur : il fermerait la
 * saisie, qui est précisément ce qu'on veut garder ouvert.
 */
import { AppConfig } from "../src/platform/config/app-config.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

/**
 * La configuration réelle, publication FERMÉE.
 *
 * Une sous-classe plutôt qu'un objet inventé : tout le reste du démarrage lit
 * cette configuration, et un faux partiel ferait échouer le boot pour une
 * raison étrangère au sujet. Seule la réponse qui nous intéresse est changée.
 */
class ClosedPublicationConfig extends AppConfig {
  override publicationEnabled(): boolean {
    return false;
  }
}

const CATEGORIES = "/pim/catalogue/categories";
const PRODUCTS = "/pim/catalogue/products";
const REVISIONS = "/pim/catalogue/revisions";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: AppConfig, value: new ClosedPublicationConfig() },
    ],
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

describe("publication fermée", () => {
  it("refuse de poser une ancre, en le nommant", async () => {
    const response = await staff().post(REVISIONS).send({});

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe("catalogue.publication.closed");
  });

  it("refuse le push vers la plateforme professionnelle", async () => {
    const response = await staff().post("/pim/channels/b2b/push").send({ dryRun: true });

    expect(response.status).toBe(409);
  });

  /**
   * Le mur ne doit pas déborder : c'est tout l'objet du drapeau. On ferme ce
   * qui SORT, on n'empêche pas d'écrire une fiche — sinon le déploiement où on
   * veut justement saisir le catalogue serait celui qui l'interdit.
   */
  it("laisse créer une famille et une fiche", async () => {
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
  });

  it("laisse LIRE les ancres déjà posées — un historique n'est pas une publication", async () => {
    const response = await staff().get(REVISIONS);

    expect(response.status).toBe(200);
  });
});

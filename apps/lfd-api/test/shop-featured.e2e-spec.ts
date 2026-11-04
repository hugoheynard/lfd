/**
 * E2E des **incontournables pros sans jeton** — `GET /shop/featured`
 * (landing `/pro`, 2026-10-19).
 *
 * Ce que seul ce niveau prouve : la route est publique, elle lit la vraie
 * décision « mis en avant pour les pros » à travers le vrai filtre de la
 * vitrine pro (publication, validation, audience), et elle ne laisse passer
 * AUCUN prix — un prix pro dépend de la société.
 */
import type { ShopFeaturedView } from "@lfd/contracts";

import { InMemoryPublicShelf } from "../src/b2b/catalog/application/__tests__/public-shelf-doubles.js";
import { PublicShelfStateReader } from "../src/b2b/catalog/domain/ports/public-shelf-state.reader.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import { anActiveFiche, relayAll, SILENT_TRIGGER, type Fiche } from "./catalog-facts-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const PRODUCTS = "/pim/catalogue/products";

let ctx: E2eContext;

/**
 * L'état du rayon public (C3), tenu à la main : éteint par défaut comme
 * l'objet, allumé par un test. Le seul double ajouté — la décision, le
 * contrôleur, le middleware et l'en-tête sont les vrais.
 */
const publicShelf = new InMemoryPublicShelf();

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: OutboxRelayTrigger, value: SILENT_TRIGGER },
      { token: PublicShelfStateReader, value: publicShelf },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  publicShelf.enabled = false;
});

const staff = (): ReturnType<E2eContext["http"]> => ctx.asSub(E2E_STAFF_SUB);

/** Une fiche publiée, arrivée sur la plateforme, validée pour les deux audiences. */
async function onSale(name: string): Promise<Fiche> {
  const fiche = await anActiveFiche(staff, name);
  await relayAll(ctx);
  await staff()
    .post("/admin/catalog/review/approve")
    .send({ skus: [fiche.variantSku], audiences: ["pro", "public"] })
    .expect(204);
  return fiche;
}

async function feature(fiche: Fiche, audience: "pro" | "public"): Promise<void> {
  await staff()
    .put(`/admin/catalog/${fiche.variantSku}/featured`)
    .send({ audience, featured: true })
    .expect(204);
}

async function featured(query = "?audience=pro"): Promise<ShopFeaturedView> {
  return jsonBody<ShopFeaturedView>(await ctx.http().get(`/shop/featured${query}`).expect(200));
}

describe("GET /shop/featured?audience=pro", () => {
  it("sert sans jeton l'article mis en avant pour les pros, et pas celui du public seul", async () => {
    const pro = await onSale("Croissant");
    const publicOnly = await onSale("Éclair");
    await feature(pro, "pro");
    await feature(publicOnly, "public");

    const view = await featured("?audience=pro&lang=en");

    expect(view.map((item) => item.sku)).toEqual([pro.variantSku]);
  });

  it("ne sort pas un article mis en avant puis dépublié au référentiel", async () => {
    const kept = await onSale("Financier");
    const unpublished = await onSale("Madeleine");
    await feature(kept, "pro");
    await feature(unpublished, "pro");

    await staff().put(`${PRODUCTS}/${unpublished.id}/unpublish`).send({}).expect(200);
    await relayAll(ctx);

    expect((await featured()).map((item) => item.sku)).toEqual([kept.variantSku]);
  });

  it("🔴 ne porte aucun prix : seulement le nom, la ligne, les images et le rayon", async () => {
    const pro = await onSale("Brioche");
    await feature(pro, "pro");

    const [item] = await featured();

    expect(Object.keys(item ?? {}).sort()).toEqual([
      "image",
      "name",
      "note",
      "shelfId",
      "sku",
      "thumbnail",
    ]);
    expect(item).toMatchObject({ sku: pro.variantSku, name: "Brioche", shelfId: pro.categoryId });
  });

  it("refuse une audience autre que pro, et une audience absente, d'un 400", async () => {
    await ctx.http().get("/shop/featured?audience=public").expect(400);
    await ctx.http().get("/shop/featured").expect(400);
    await ctx.http().get("/shop/featured?audience=pro&lang=de").expect(400);
  });
});

/**
 * Workers Cache (C3, `plan-cache-du-catalogue.md` § 3) : l'en-tête que la
 * route pose, à travers le vrai middleware. Échoue si la route s'offre à un
 * cache partagé drapeau éteint, ou si l'en-tête exact change.
 */
describe("GET /shop/featured — Workers Cache", () => {
  it("drapeau éteint (le défaut) : l'en-tête privé du middleware, sans étiquette", async () => {
    const response = await ctx.http().get("/shop/featured?audience=pro").expect(200);

    expect(response.headers["cache-control"]).toBe("private, no-cache");
    expect(response.headers["cache-tag"]).toBeUndefined();
  });

  it("drapeau allumé : public 30 s, étiqueté rayon-public — avec ou sans jeton", async () => {
    publicShelf.enabled = true;

    const anonymous = await ctx.http().get("/shop/featured?audience=pro").expect(200);
    const withToken = await staff().get("/shop/featured?audience=pro").expect(200);

    for (const response of [anonymous, withToken]) {
      expect(response.headers["cache-control"]).toBe("public, max-age=30");
      expect(response.headers["cache-tag"]).toBe("rayon-public");
    }
  });

  it("drapeau allumé, un refus 400 reste privé", async () => {
    publicShelf.enabled = true;

    const response = await ctx.http().get("/shop/featured?audience=public").expect(400);

    expect(response.headers["cache-control"]).not.toContain("public");
  });
});

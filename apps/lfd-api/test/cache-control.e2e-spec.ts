/**
 * E2E du **`Cache-Control` par défaut** (plan
 * `documentation/caching-usage/plan-aucun-cache-sur-le-personnel.md`).
 *
 * Seul ce niveau prouve que la règle couvre TOUTES les réponses : celles des
 * contrôleurs, mais aussi un refus des guards, une 404 de chemin inconnu, et
 * qu'une route qui pose son propre en-tête garde le sien. Les assertions ne
 * portent que sur l'en-tête : le statut de chaque appel n'est pas le sujet.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { SHOP_COPY_CACHE_CONTROL } from "../src/b2b/shop-copy/http/shop-copy-cache-headers.js";
import {
  ANONYMOUS_CACHE_CONTROL,
  PERSONAL_CACHE_CONTROL,
} from "../src/platform/security/cache-control-by-default.middleware.js";
import { bootstrapE2e, E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";

/** Le jeton porteur EST le `sub` : le mur se joue en base, comme en production. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const CACHE_CONTROL = "cache-control";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

describe("Cache-Control par défaut", () => {
  it("une route du staff, appelée par le staff, ne se garde nulle part", async () => {
    const response = await ctx.asSub(E2E_STAFF_SUB).get("/admin/shop-copy");
    expect(response.headers[CACHE_CONTROL]).toBe(PERSONAL_CACHE_CONTROL);
  });

  it("une route publique à jeton facultatif, appelée avec un jeton, ne se garde nulle part", async () => {
    const response = await ctx.asSub("auth0|client-cache").get("/shop/catalogue/mine");
    expect(response.headers[CACHE_CONTROL]).toBe(PERSONAL_CACHE_CONTROL);
  });

  it("la même route, sans jeton, se revalide sans cache partagé", async () => {
    const response = await ctx.http().get("/shop/catalogue/mine");
    expect(response.headers[CACHE_CONTROL]).toBe(ANONYMOUS_CACHE_CONTROL);
  });

  it("un refus des guards porte l'en-tête de l'appelant", async () => {
    // Un `sub` qu'aucune fiche staff ne connaît : le mur refuse (403).
    const refused = await ctx.asSub("auth0|inconnu").get("/admin/shop-copy").expect(403);
    expect(refused.headers[CACHE_CONTROL]).toBe(PERSONAL_CACHE_CONTROL);
    const anonymous = await ctx.http().get("/admin/shop-copy").expect(401);
    expect(anonymous.headers[CACHE_CONTROL]).toBe(ANONYMOUS_CACHE_CONTROL);
  });

  it("un chemin inconnu porte l'en-tête par défaut", async () => {
    const response = await ctx.asSub(E2E_STAFF_SUB).get("/aucune-route-ici").expect(404);
    expect(response.headers[CACHE_CONTROL]).toBe(PERSONAL_CACHE_CONTROL);
  });

  it("une route qui pose son propre en-tête garde le sien", async () => {
    const copy = await ctx.http().get("/shop/copy?locale=fr").expect(200);
    expect(copy.headers[CACHE_CONTROL]).toBe(SHOP_COPY_CACHE_CONTROL);
    // `@Header("Cache-Control", "no-store")`, posé après le handler, l'emporte
    // sur le `no-cache` que le middleware donne à un visiteur.
    const admission = await ctx
      .http()
      .post("/order-admission/guest")
      .send({ email: "visiteur@lfc.test" })
      .expect(200);
    expect(admission.headers[CACHE_CONTROL]).toBe("no-store");
  });
});

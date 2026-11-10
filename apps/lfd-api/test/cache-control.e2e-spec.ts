/**
 * E2E du **`Cache-Control` par défaut** (plan
 * `documentation/caching-usage/aucune-reponse-personnelle-en-cache.md`).
 *
 * Seul ce niveau prouve que la règle couvre TOUTES les réponses : celles des
 * contrôleurs, mais aussi un refus des guards, une 404 de chemin inconnu, et
 * qu'une route qui pose son propre en-tête garde le sien. Les assertions ne
 * portent que sur l'en-tête : le statut de chaque appel n'est pas le sujet.
 */
import type { CreatedPickupResponse } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { PUBLIC_PICKUPS_CACHE_CONTROL } from "../src/b2b/pickup-addresses/http/public-pickup-cache-headers.js";
import {
  PUBLIC_SETTINGS_CACHE_CONTROL,
  PUBLIC_SETTINGS_CACHE_TAG,
} from "../src/b2b/shared/public-settings-cache/http/public-settings-cache-headers.js";
import { SHOP_COPY_CACHE_CONTROL } from "../src/b2b/shop-copy/http/shop-copy-cache-headers.js";
import {
  ANONYMOUS_CACHE_CONTROL,
  PERSONAL_CACHE_CONTROL,
} from "../src/platform/security/cache-control-by-default.middleware.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";

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
  // Sans ce `reset()`, la suite n'a aucun opérateur semé : elle ne tenait que
  // par une fiche `staff-e2e` laissée par une suite voisine dans la même base.
  // Sur une base migrée à neuf (la CI, shard réordonné le 2026-11-10), la
  // création d'un point de retrait répondait 403.
  await ctx.reset();
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

  it.each(["/content/footer", "/order-opening", "/delivery-zones", "/delivery-availability"])(
    "le réglage public %s s'offre à Workers Cache, étiqueté pour la purge (2026-11-05)",
    async (path) => {
      const response = await ctx.http().get(path).expect(200);
      expect(response.headers[CACHE_CONTROL]).toBe(PUBLIC_SETTINGS_CACHE_CONTROL);
      expect(response.headers["cache-tag"]).toBe(PUBLIC_SETTINGS_CACHE_TAG);
    },
  );

  it("les voisines du pied de page restent au défaut : seul le pied de page est ouvert", async () => {
    const legal = await ctx.http().get("/content/accessibility-follow-up").expect(200);
    expect(legal.headers[CACHE_CONTROL]).toBe(ANONYMOUS_CACHE_CONTROL);
    expect(legal.headers["cache-tag"]).toBeUndefined();
  });
});

/**
 * La liste publique des points de retrait (2026-11-05,
 * `documentation/caching-usage/carte-des-caches.md`) : `public,
 * max-age=30` sans `stale-while-revalidate`, étiquetée pour la purge — sur
 * `list()` seulement : les créneaux dépendent de l'heure.
 */
describe("Cache-Control de la liste publique des points", () => {
  it.each(["/pickup-addresses", "/pickup-addresses?audience=pro"])(
    "%s s'offre à Workers Cache, sans revalidation périmée, étiquetée",
    async (path) => {
      const response = await ctx.http().get(path).expect(200);
      expect(response.headers[CACHE_CONTROL]).toBe(PUBLIC_PICKUPS_CACHE_CONTROL);
      expect(response.headers[CACHE_CONTROL]).not.toContain("stale-while-revalidate");
      expect(response.headers["cache-tag"]).toBe(PUBLIC_SETTINGS_CACHE_TAG);
    },
  );

  it("une audience inconnue est refusée (400), et ne s'offre à aucun cache", async () => {
    // Sinon, une adresse de cache par chaîne inventée.
    const response = await ctx.http().get("/pickup-addresses?audience=inconnue").expect(400);
    expect(response.headers[CACHE_CONTROL]).toBe(ANONYMOUS_CACHE_CONTROL);
    expect(response.headers["cache-tag"]).toBeUndefined();
  });

  it("les créneaux d'un point restent au défaut : ils dépendent de l'heure", async () => {
    const created = await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/pickup-addresses")
      .send({
        label: "Point du cache",
        ligne1: "1 rue du Test",
        ligne2: "",
        codePostal: "75001",
        ville: "Paris",
        pays: "France",
        opening: { publicOpening: null, proPickup: null },
      })
      .expect(201);
    const { id } = jsonBody<CreatedPickupResponse>(created);
    const slots = await ctx
      .http()
      .get(`/pickup-addresses/${id}/creneaux`)
      .query({ jour: serviceDay() })
      .expect(200);
    expect(slots.headers[CACHE_CONTROL]).toBe(ANONYMOUS_CACHE_CONTROL);
    expect(slots.headers["cache-tag"]).toBeUndefined();
  });
});

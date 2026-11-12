import { describe, expect, it } from "vitest";

import { forwardedSearch } from "../cache-key";

/**
 * Régression : `/api/lfd/shop/catalogue?x=<aléatoire>` manquait le cache du
 * bord à chaque appel, et chaque appel lisait la base (constaté le 2026-11-12).
 */
describe("forwardedSearch — la clé du cache des routes gardées", () => {
  it("retire un paramètre inconnu du rayon public", () => {
    expect(forwardedSearch("/shop/catalogue", "?x=123")).toBe("");
  });

  it("garde lang et audience, dans un ordre fixe", () => {
    expect(forwardedSearch("/shop/catalogue", "?lang=en&x=1&audience=pro")).toBe(
      "?audience=pro&lang=en",
    );
    expect(forwardedSearch("/shop/featured", "?audience=public&lang=fr")).toBe(
      "?audience=public&lang=fr",
    );
  });

  it("ne garde qu'une valeur d'un paramètre répété", () => {
    expect(forwardedSearch("/shop/catalogue", "?lang=fr&lang=en")).toBe("?lang=fr");
  });

  it("laisse intacte la requête des autres routes", () => {
    expect(forwardedSearch("/shop/quote", "?x=1")).toBe("?x=1");
    expect(forwardedSearch("/orders", "")).toBe("");
  });
});

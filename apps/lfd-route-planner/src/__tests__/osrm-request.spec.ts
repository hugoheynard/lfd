import { describe, expect, it } from "vitest";

import { admit, isContainerFailure, unavailable } from "../osrm-request";

const BASE = "http://lfd-route-planner.internal";
const TABLE = "/table/v1/driving/6.9797,45.4486;6.7713,45.5724";
const ROUTE = "/route/v1/driving/6.9797,45.4486;6.7713,45.5724?overview=false";

describe("admit", () => {
  it("admet GET /table/… et GET /route/…", () => {
    expect(admit(new Request(`${BASE}${TABLE}`)).admitted).toBe(true);
    expect(admit(new Request(`${BASE}${ROUTE}`)).admitted).toBe(true);
  });

  it.each([
    "/",
    "/nearest/v1/driving/6.9,45.4",
    "/trip/v1/driving/6.9,45.4",
    "/tile/v1/car/1,2,3.mvt",
    "/tablex",
  ])("refuse en 404 le chemin non servi %s", (path) => {
    const verdict = admit(new Request(`${BASE}${path}`));
    expect(verdict.admitted).toBe(false);
    if (!verdict.admitted) {
      expect(verdict.response.status).toBe(404);
    }
  });

  it("refuse en 405 toute autre méthode que GET, même sur un chemin servi", () => {
    const verdict = admit(new Request(`${BASE}${TABLE}`, { method: "POST", body: "{}" }));
    expect(verdict.admitted).toBe(false);
    if (!verdict.admitted) {
      expect(verdict.response.status).toBe(405);
    }
  });
});

describe("isContainerFailure", () => {
  it("laisse passer les réponses d'OSRM lui-même (200, 400)", () => {
    expect(isContainerFailure(200)).toBe(false);
    expect(isContainerFailure(400)).toBe(false);
  });

  it("reconnaît la couche conteneur (500, 503, 520, 429)", () => {
    for (const status of [500, 503, 520, 429]) {
      expect(isContainerFailure(status)).toBe(true);
    }
  });
});

describe("unavailable", () => {
  it("rend un 503 qui nomme la cause et le geste de sortie", async () => {
    const response = unavailable("le conteneur a rendu 500");
    expect(response.status).toBe(503);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ code: "LfdOsrmRefused" });
    expect(JSON.stringify(body)).toContain("le conteneur a rendu 500");
    // Régression : le message renvoyait vers l'estimation à vol d'oiseau,
    // supprimée par L10b-C5 (corrigé le 2026-10-07).
    expect(JSON.stringify(body)).toContain("Réessayez");
  });
});

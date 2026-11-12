import {
  contentCacheOf,
  contentCacheOfPath,
  HOUR_MS,
  hourOf,
  oldestKeptHour,
  parseMetricsCall,
  PerSecondCounter,
  servedPersonOf,
  SERVED_PERSON_HEADER,
  sizesByContentCache,
  storedContentCacheOf,
} from "../cache-metrics-store";

/**
 * Les décisions pures des compteurs des objets. Ces tests échouent si deux
 * caches de contenu se mélangent, si une révision change le nom d'un cache,
 * ou si une empreinte mal formée est comptée comme une personne.
 */
const ORIGIN = "http://journees.interne";

describe("compteurs des objets — décisions pures", () => {
  it("nomme le cache d'une clé de contenu par son préfixe", () => {
    expect(contentCacheOf("pim-product:01J")).toBe("pim-product");
    expect(contentCacheOf("catalog-admin")).toBe("catalog-admin");
    expect(contentCacheOfPath("/contents/pim-product%3A01J")).toBe("pim-product");
    expect(storedContentCacheOf("r:abc%2Fdef/pim-product:01J")).toBe("pim-product");
  });

  it("regroupe la taille rangée par préfixe, toutes révisions confondues", () => {
    const sizes = sizesByContentCache([
      { key: "r:a/pim-product:1", bytes: 10 },
      { key: "r:b/pim-product:2", bytes: 5 },
      { key: "r:a/catalog-admin", bytes: 7 },
    ]);
    expect(sizes.get("pim-product")).toEqual({ bytes: 15, entries: 2 });
    expect(sizes.get("catalog-admin")).toEqual({ bytes: 7, entries: 1 });
  });

  it("comprend la lecture des compteurs, et seulement elle", () => {
    expect(parseMetricsCall("GET", new URL(`${ORIGIN}/metrics?since=3600000`))).toEqual({
      sinceMs: 3_600_000,
    });
    expect(parseMetricsCall("GET", new URL(`${ORIGIN}/metrics`))).toEqual({ sinceMs: 0 });
    expect(parseMetricsCall("GET", new URL(`${ORIGIN}/metrics?since=-1`))).toBeNull();
    expect(parseMetricsCall("PUT", new URL(`${ORIGIN}/metrics`))).toBeNull();
    expect(parseMetricsCall("GET", new URL(`${ORIGIN}/scopes/global`))).toBeNull();
  });

  it("borne les heures gardées à trente jours", () => {
    const now = 1000 * HOUR_MS + 123;
    expect(hourOf(now)).toBe(1000 * HOUR_MS);
    expect(oldestKeptHour(now)).toBe((1000 - 30 * 24) * HOUR_MS);
  });

  it("ne lit une personne que sur une empreinte bien formée", () => {
    const valid = "c".repeat(64);
    expect(servedPersonOf(new Headers({ [SERVED_PERSON_HEADER]: valid }))).toBe(valid);
    expect(servedPersonOf(new Headers({ [SERVED_PERSON_HEADER]: "jean@example.org" }))).toBeNull();
    expect(servedPersonOf(new Headers())).toBeNull();
  });

  it("clôt une seconde à la première requête de la suivante", () => {
    const counter = new PerSecondCounter();
    expect(counter.tick(1000)).toBeNull();
    expect(counter.tick(1999)).toBeNull();
    expect(counter.tick(2000)).toEqual({ secondMs: 1000, requests: 2 });
    expect(counter.current()).toEqual({ secondMs: 2000, requests: 1 });
  });
});

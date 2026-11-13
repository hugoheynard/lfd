import { DurableObjectShopShelfSwitch } from "../../src/lafoliecoffee/catalog/infrastructure/durable-object-shop-shelf-switch";
import { InternalPublicShelf } from "../../src/lafoliecoffee/catalog/infrastructure/internal-public-shelf";
import { DurableObjectCacheMetricsReader } from "../../src/ops/caches/durable-object-cache-metrics.reader";
import { DurableObjectDayContentsCache } from "../../src/platform/day-versions/durable-object-day-contents-cache";
import { DurableObjectDayVersionsCache } from "../../src/platform/day-versions/durable-object-day-versions-cache";
import { DurableObjectVersionedContentCache } from "../../src/platform/day-versions/durable-object-versioned-content-cache";
import { parseMetricsCall } from "../cache-metrics-store";
import { parseDayContentCall } from "../day-contents-store";
import { parseDayVersionsCall } from "../day-versions-store";
import {
  DAY_VERSIONS_ORIGIN,
  INTERNAL_OBJECTS_HOST,
  internalObjectRouteOf,
  objectUrlOf,
  SHELF_STORE_ORIGIN,
  type InternalObject,
} from "../internal-objects";
import { isPublicPurgeRelay } from "../public-shelf";
import { parseShelfCall } from "../shelf-store";
import { parseContentCall } from "../versioned-contents-store";

/** Ce qu'un objet a reçu : le chemin, tel que l'aiguillage le lui transmet. */
interface Delivery {
  readonly object: InternalObject;
  readonly method: string;
  readonly url: URL;
}

/**
 * Le chemin conteneur → Worker → objet, joué sans runtime : les VRAIS
 * adaptateurs de l'API appellent les adresses que le Worker pose, et
 * l'aiguillage du Worker décide de l'objet. Toute réponse est un 404 — seul
 * compte qui a reçu quoi.
 */
function throughWorker(): {
  readonly deliveries: Delivery[];
  readonly fetchFn: (url: string, init: RequestInit) => Promise<Response>;
} {
  const deliveries: Delivery[] = [];
  return {
    deliveries,
    fetchFn: (raw, init) => {
      const url = new URL(raw);
      const route = internalObjectRouteOf(url);
      if (route !== null) {
        deliveries.push({
          object: route.object,
          method: init.method ?? "GET",
          url: objectUrlOf(url, route),
        });
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    },
  };
}

/** Ce que l'objet des rayons comprend (`pro-shelves.ts` et le relais de purge). */
function proShelvesUnderstands({ method, url }: Delivery): boolean {
  return (
    parseMetricsCall(method, url) !== null ||
    parseShelfCall(method, url) !== null ||
    isPublicPurgeRelay(method, url.pathname)
  );
}

/** Ce que l'objet des journées comprend (`day-versions.ts`). */
function dayVersionsUnderstands({ method, url }: Delivery): boolean {
  return (
    parseMetricsCall(method, url) !== null ||
    parseDayVersionsCall(method, url) !== null ||
    parseContentCall(method, url) !== null ||
    parseDayContentCall(method, url) !== null
  );
}

describe("le chemin interne vers les objets partagés", () => {
  /**
   * Régression : en production, les `/metrics` des deux objets rendaient les
   * compteurs `pro-shelves` — les appels de l'objet des journées arrivaient à
   * celui des rayons (constaté le 2026-11-12).
   */
  it("livre chaque appel de l'API à l'objet qu'il vise, sous un chemin qu'il comprend", async () => {
    const { deliveries, fetchFn } = throughWorker();

    await new DurableObjectCacheMetricsReader(
      [
        { object: "day-versions", origin: DAY_VERSIONS_ORIGIN },
        { object: "pro-shelves", origin: SHELF_STORE_ORIGIN },
      ],
      fetchFn,
    ).read(7_200_000);
    await new DurableObjectDayVersionsCache(DAY_VERSIONS_ORIGIN, "rev-1", fetchFn).read("global");
    await new DurableObjectVersionedContentCache(DAY_VERSIONS_ORIGIN, "rev-1", fetchFn).read(
      "catalogue",
      3,
    );
    await new DurableObjectDayContentsCache(DAY_VERSIONS_ORIGIN, "rev-1", fetchFn).read({
      screen: "worksheet",
      day: "2030-03-12",
      tag: "orders:7.production:4",
    });
    await new DurableObjectShopShelfSwitch(SHELF_STORE_ORIGIN, fetchFn)
      .apply("off")
      .catch(() => undefined);
    await new InternalPublicShelf(SHELF_STORE_ORIGIN, fetchFn).read().catch(() => undefined);
    await new InternalPublicShelf(SHELF_STORE_ORIGIN, fetchFn).purge().catch(() => undefined);

    const at = (object: InternalObject): readonly Delivery[] =>
      deliveries.filter((delivery) => delivery.object === object);
    expect(deliveries).toHaveLength(8);
    expect(at("day-versions").map((delivery) => delivery.url.pathname)).toEqual([
      "/metrics",
      "/scopes/global",
      "/contents/catalogue",
      "/day-contents/worksheet/2030-03-12",
    ]);
    expect(at("pro-shelves").map((delivery) => delivery.url.pathname)).toEqual([
      "/metrics",
      "/switch",
      "/public/state",
      "/public/purge",
    ]);
    expect(at("day-versions").every(dayVersionsUnderstands)).toBe(true);
    expect(at("pro-shelves").every(proShelvesUnderstands)).toBe(true);
  });

  it("les deux adresses partagent l'hôte intercepté et ne diffèrent que par le préfixe", () => {
    expect(new URL(SHELF_STORE_ORIGIN).hostname).toBe(INTERNAL_OBJECTS_HOST);
    expect(new URL(DAY_VERSIONS_ORIGIN).hostname).toBe(INTERNAL_OBJECTS_HOST);
    expect(SHELF_STORE_ORIGIN).not.toBe(DAY_VERSIONS_ORIGIN);
  });

  it("garde la requête et retire le préfixe", () => {
    const url = new URL(`${DAY_VERSIONS_ORIGIN}/scopes/2030-03-12?revision=r`);
    const route = internalObjectRouteOf(url);

    expect(route).toEqual({ object: "day-versions", pathname: "/scopes/2030-03-12" });
    expect(route === null ? null : objectUrlOf(url, route).href).toBe(
      `http://${INTERNAL_OBJECTS_HOST}/scopes/2030-03-12?revision=r`,
    );
  });

  it("refuse un préfixe inconnu, un préfixe seul, ou un préfixe collé à la suite", () => {
    for (const path of ["/autre/metrics", "/rayons", "/journeesx/metrics", "/metrics"]) {
      expect(internalObjectRouteOf(new URL(`http://${INTERNAL_OBJECTS_HOST}${path}`))).toBeNull();
    }
  });

  it("n'aiguille plus les anciens hôtes, retirés", () => {
    expect(internalObjectRouteOf(new URL("http://rayons.interne/metrics"))).toBeNull();
    expect(internalObjectRouteOf(new URL("http://journees.interne/metrics"))).toBeNull();
  });

  it("ignore tout autre hôte", () => {
    expect(internalObjectRouteOf(new URL("http://exemple.fr/rayons/metrics"))).toBeNull();
  });
});

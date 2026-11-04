import type { ShopCatalogueView } from "@lfd/contracts";

import { InMemoryShopShelfCache } from "../../infrastructure/in-memory-shop-shelf-cache.js";
import type { ShelfLookup } from "../../domain/ports/shop-shelf-cache.js";
import { SHELF_CALL_LIMIT_MS, SHELF_ROUND_TRIP_TIMING } from "../shelf-call-guard.js";
import { SHELF_BREAKER_FAILURES, SHELF_BREAKER_PAUSE_MS } from "../shelf-cache-breaker.js";
import { BrokenShelfCache, resilientAround, type ShelfFailure } from "./shelf-cache-doubles.js";

/**
 * **Le cache n'est jamais sur le chemin de la disponibilité** (§ 4 bis) :
 * aucune panne du magasin ne remonte, chacune se compte sous un nom stable.
 */
const NOW = new Date(Date.UTC(2030, 0, 1));
const LATER = new Date(NOW.getTime() + 30_000);
const VIEW: ShopCatalogueView = { shelves: [], items: [], operations: [] };

/** Un magasin en mémoire qu'on casse et répare à la main. */
class FlakyShelfCache extends InMemoryShopShelfCache {
  broken = true;
  reads = 0;

  override read(key: string | null, now: Date): Promise<ShelfLookup> {
    this.reads += 1;
    return this.broken ? Promise.reject(new RangeError("panne")) : super.read(key, now);
  }
}

describe("ResilientShopShelfCache — le repli", () => {
  it("compte un raté puis un succès, et la durée de chaque aller-retour", async () => {
    const { resilient, signals, timings, deadline } = resilientAround(new InMemoryShopShelfCache());

    const miss = await resilient.read("co_a", NOW);
    await resilient.store({
      key: "co_a",
      view: VIEW,
      version: 0,
      principalId: null,
      expiresAt: LATER,
    });
    const hit = await resilient.read("co_a", NOW);

    expect(miss).toEqual({ kind: "miss", version: 0 });
    expect(hit).toEqual({ kind: "hit", view: VIEW });
    expect(signals.names()).toEqual(["miss", "stored", "hit"]);
    expect(deadline.limits).toEqual([
      SHELF_CALL_LIMIT_MS,
      SHELF_CALL_LIMIT_MS,
      SHELF_CALL_LIMIT_MS,
    ]);
    expect(timings.recorded.map((t) => [t.name, t.labels["operation"], t.ms])).toEqual([
      [SHELF_ROUND_TRIP_TIMING, "read", 7],
      [SHELF_ROUND_TRIP_TIMING, "store", 7],
      [SHELF_ROUND_TRIP_TIMING, "read", 7],
    ]);
  });

  it("compte un rangement refusé pour version dépassée", async () => {
    const cache = new InMemoryShopShelfCache();
    const { resilient, signals } = resilientAround(cache);
    await cache.erase({ kind: "all" });

    await resilient.store({
      key: "co_a",
      view: VIEW,
      version: 0,
      principalId: null,
      expiresAt: LATER,
    });

    expect(signals.names()).toEqual(["stale_refused"]);
    expect(cache.keys()).toEqual([]);
  });

  it.each<[ShelfFailure, string]>([
    ["throws", "error"],
    ["unreadable", "unreadable"],
  ])("un magasin qui %s : rien ne lève, le repli est compté (%s)", async (failure, reason) => {
    const { resilient, signals } = resilientAround(new BrokenShelfCache(failure));

    await expect(resilient.read("co_a", NOW)).resolves.toBeNull();
    await expect(
      resilient.store({ key: "co_a", view: VIEW, version: 0, principalId: null, expiresAt: LATER }),
    ).resolves.toBeUndefined();
    await expect(resilient.erase({ kind: "all" })).resolves.toBeUndefined();

    expect(signals.emitted).toEqual([
      { name: "fallback", operation: "read", reason },
      { name: "fallback", operation: "store", reason },
      { name: "fallback", operation: "erase", reason },
    ]);
  });

  it("un magasin qui ne répond pas : abandonné au délai, compté `timeout`", async () => {
    const { resilient, signals, deadline } = resilientAround(new BrokenShelfCache("hangs"));
    deadline.late = true;

    await expect(resilient.read("co_a", NOW)).resolves.toBeNull();

    expect(signals.emitted).toEqual([{ name: "fallback", operation: "read", reason: "timeout" }]);
  });

  it("le disjoncteur s'ouvre au seuil, ne rappelle plus, puis se referme sur un succès", async () => {
    const cache = new FlakyShelfCache();
    const { resilient, signals, wall } = resilientAround(cache);

    for (let i = 0; i < SHELF_BREAKER_FAILURES; i += 1) {
      await resilient.read("co_a", NOW);
    }
    expect(signals.emitted.at(-1)).toEqual({
      name: "breaker_opened",
      failures: SHELF_BREAKER_FAILURES,
    });

    await expect(resilient.read("co_a", NOW)).resolves.toBeNull();
    expect(cache.reads).toBe(SHELF_BREAKER_FAILURES);
    expect(signals.emitted.at(-1)).toEqual({
      name: "fallback",
      operation: "read",
      reason: "breaker_open",
    });

    wall.advanceMs(SHELF_BREAKER_PAUSE_MS);
    cache.broken = false;
    await expect(resilient.read("co_a", NOW)).resolves.toEqual({ kind: "miss", version: 0 });
    expect(signals.names().slice(-2)).toEqual(["breaker_closed", "miss"]);
  });

  it("l'effacement est tenté même disjoncteur ouvert : c'est lui qui rattrape un rayon faux", async () => {
    const cache = new FlakyShelfCache();
    const { resilient, signals } = resilientAround(cache);
    for (let i = 0; i < SHELF_BREAKER_FAILURES; i += 1) {
      await resilient.read("co_a", NOW);
    }

    await resilient.erase({ kind: "companies", companyIds: ["co_a", "co_b"] });

    expect(signals.emitted.at(-1)).toEqual({ name: "erased", scope: "companies", companies: 2 });
  });
});

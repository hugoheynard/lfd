import type { ShopCatalogueView } from "@lfd/contracts";

import {
  FixedStopwatch,
  RecordingTimings,
} from "../../../../platform/metrics/__tests__/metrics-doubles.js";
import { FixedWallClock } from "../../../../platform/time/fixed-wall-clock.js";
import type { ShelfLookup } from "../../domain/ports/shop-shelf-cache.js";
import { InMemoryShopShelfCache } from "../../infrastructure/in-memory-shop-shelf-cache.js";
import { NodeShelfCallDeadline } from "../../infrastructure/node-shelf-call-deadline.js";
import { ResilientShopShelfCache } from "../resilient-shop-shelf-cache.js";
import { SHELF_CALL_LIMIT_MS, ShelfCallGuard } from "../shelf-call-guard.js";
import { RecordingShelfSignals } from "./shelf-cache-doubles.js";

const NOW = new Date(Date.UTC(2030, 0, 1));
const LATER = new Date(NOW.getTime() + 30_000);
const VIEW: ShopCatalogueView = { shelves: [], items: [], operations: [] };
/** Ce que l'ancien délai (100 ms) abandonnait, et que le nouveau tient. */
const FORMER_LIMIT_MS = 100;
const MARGIN_MS = 60;

/** Un magasin qui répond, mais en `delayMs` réelles. */
class DelayedShelfCache extends InMemoryShopShelfCache {
  constructor(private readonly delayMs: number) {
    super();
  }

  override async read(key: string | null, now: Date): Promise<ShelfLookup> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return super.read(key, now);
  }
}

async function readAfter(delayMs: number): Promise<{
  readonly lookup: ShelfLookup | null;
  readonly signals: RecordingShelfSignals;
}> {
  const cache = new DelayedShelfCache(delayMs);
  await cache.store({ key: "co_a", view: VIEW, version: 0, principalId: null, expiresAt: LATER });
  const signals = new RecordingShelfSignals();
  const guard = new ShelfCallGuard(
    new NodeShelfCallDeadline(),
    new FixedWallClock(NOW),
    new FixedStopwatch(7),
    new RecordingTimings(),
    signals,
  );
  const lookup = await new ResilientShopShelfCache(cache, cache, guard, signals).read("co_a", NOW);
  return { lookup, signals };
}

/**
 * Le délai de lecture porté à 400 ms le 2026-11-05 : en production, deux
 * lectures sur trois dépassaient 100 ms et l'API recalculait le rayon.
 */
describe("le délai de lecture du rayon rangé", () => {
  it("vaut 400 ms", () => {
    expect(SHELF_CALL_LIMIT_MS).toBe(400);
  });

  it("sert le rayon d'une lecture au-delà de 100 ms mais sous 400 ms, sans repli", async () => {
    const { lookup, signals } = await readAfter(FORMER_LIMIT_MS + MARGIN_MS * 2);

    expect(lookup).toEqual({ kind: "hit", view: VIEW });
    expect(signals.names()).toEqual(["hit"]);
  });

  it("au-delà de 400 ms, replie et compte `timeout`", async () => {
    const { lookup, signals } = await readAfter(SHELF_CALL_LIMIT_MS + MARGIN_MS);

    expect(lookup).toBeNull();
    expect(signals.emitted).toEqual([{ name: "fallback", operation: "read", reason: "timeout" }]);
  });
});

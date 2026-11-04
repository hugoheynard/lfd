import type { ShopCatalogueView } from "@lfd/contracts";

import type { ShelfPurgeOrder } from "../../shared/shelf-changes/domain/shelf-purge-batch.js";
import {
  ShopShelfCache,
  type ShelfKey,
  type ShelfLookup,
  type ShelfToStore,
  type StoreOutcome,
} from "../domain/ports/shop-shelf-cache.js";
import type { ShopShelfEraser } from "../domain/ports/shop-shelf-eraser.js";

interface Kept {
  readonly view: ShopCatalogueView;
  readonly principalId: string | null;
  readonly expiresAtMs: number;
}

/**
 * **Le magasin des rayons pro en mémoire** — la version du port contre
 * laquelle tournent les tests d'application (`plan-cache-du-catalogue.md`,
 * § 4 ter : jamais contre l'objet). Mêmes règles que l'objet
 * (`container/shelf-store.ts`) : version globale montée par tout effacement,
 * rangement refusé sur une version dépassée, une société efface aussi les
 * entrées dont elle est le principal, une entrée échue est un raté.
 */
export class InMemoryShopShelfCache extends ShopShelfCache implements ShopShelfEraser {
  private version = 0;
  private readonly entries = new Map<ShelfKey, Kept>();

  read(key: ShelfKey, now: Date): Promise<ShelfLookup> {
    const kept = this.entries.get(key);
    if (kept === undefined || kept.expiresAtMs <= now.getTime()) {
      return Promise.resolve({ kind: "miss", version: this.version });
    }
    return Promise.resolve({ kind: "hit", view: kept.view });
  }

  store(entry: ShelfToStore): Promise<StoreOutcome> {
    if (entry.version !== this.version) {
      return Promise.resolve("stale");
    }
    this.entries.set(entry.key, {
      view: entry.view,
      principalId: entry.principalId,
      expiresAtMs: entry.expiresAt.getTime(),
    });
    return Promise.resolve("stored");
  }

  erase(order: ShelfPurgeOrder): Promise<void> {
    this.version += 1;
    if (order.kind === "all") {
      this.entries.clear();
      return Promise.resolve();
    }
    const erased = new Set(order.companyIds);
    for (const [key, kept] of [...this.entries]) {
      if (
        (key !== null && erased.has(key)) ||
        (kept.principalId !== null && erased.has(kept.principalId))
      ) {
        this.entries.delete(key);
      }
    }
    return Promise.resolve();
  }

  /** Les clés rangées, pour qu'un test lise ce qui reste. */
  keys(): readonly ShelfKey[] {
    return [...this.entries.keys()];
  }
}

import type { ShelfPurgeOrder } from "../../shared/shelf-changes/domain/shelf-purge-batch.js";
import {
  ShopShelfCache,
  type ShelfLookup,
  type ShelfToStore,
  type StoreOutcome,
} from "../domain/ports/shop-shelf-cache.js";
import type { ShopShelfEraser } from "../domain/ports/shop-shelf-eraser.js";

/**
 * **Sans magasin** : toujours un raté, rien de gardé, purge sans effet. Relié
 * quand la configuration ne nomme aucun magasin (`AppConfig.shopShelfCacheUrl`)
 * — le dev local hors wrangler et les e2e, qui calculent donc chaque rayon
 * depuis la base comme avant C2.
 */
export class NoShopShelfCache extends ShopShelfCache implements ShopShelfEraser {
  read(): Promise<ShelfLookup> {
    return Promise.resolve({ kind: "miss", version: 0 });
  }

  store(_entry: ShelfToStore): Promise<StoreOutcome> {
    return Promise.resolve("not_kept");
  }

  erase(_order: ShelfPurgeOrder): Promise<void> {
    return Promise.resolve();
  }
}

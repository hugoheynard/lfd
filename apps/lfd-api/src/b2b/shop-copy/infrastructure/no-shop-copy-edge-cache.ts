import { ShopCopyEdgeCache } from "../domain/ports/shop-copy-edge-cache.js";

/**
 * **Sans Worker** (`SHOP_SHELF_CACHE_URL` absente : dev local hors wrangler,
 * e2e) : aucune bordure ne garde les textes, rien à purger.
 */
export class NoShopCopyEdgeCache extends ShopCopyEdgeCache {
  purge(): Promise<void> {
    return Promise.resolve();
  }
}

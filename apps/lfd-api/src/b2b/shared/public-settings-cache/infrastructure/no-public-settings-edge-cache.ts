import { PublicSettingsEdgeCache } from "../domain/ports/public-settings-edge-cache.js";

/**
 * **Sans Worker** (`SHOP_SHELF_CACHE_URL` absente : dev local hors wrangler,
 * e2e) : aucune bordure ne garde les réglages, rien à purger.
 */
export class NoPublicSettingsEdgeCache extends PublicSettingsEdgeCache {
  purge(): Promise<void> {
    return Promise.resolve();
  }
}

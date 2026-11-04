import type { PublicShelfEraser } from "../domain/ports/public-shelf-eraser.js";
import {
  PublicShelfStateReader,
  type PublicShelfState,
} from "../domain/ports/public-shelf-state.reader.js";

/**
 * **Sans magasin** (`SHOP_SHELF_CACHE_URL` absente : dev local hors wrangler,
 * e2e) : le drapeau public n'existe nulle part, donc il est éteint — aucune
 * réponse publique ne s'offre à un cache partagé, comme avant C3. La purge
 * n'a rien à purger.
 */
export class NoPublicShelf extends PublicShelfStateReader implements PublicShelfEraser {
  read(): Promise<PublicShelfState> {
    return Promise.resolve({ enabled: false, version: 0 });
  }

  purge(): Promise<void> {
    return Promise.resolve();
  }
}

import { ShelfCacheNotConfiguredError } from "../domain/errors/shelf-cache-not-configured.error.js";
import {
  ShopShelfSwitch,
  type ShelfCacheState,
  type ShelfSwitchAction,
} from "../domain/ports/shop-shelf-switch.js";

/**
 * **Sans magasin** : l'interrupteur refuse en le disant, plutôt que de
 * prétendre avoir éteint un cache qui n'existe pas.
 */
export class NoShopShelfSwitch extends ShopShelfSwitch {
  apply(_action: ShelfSwitchAction): Promise<ShelfCacheState> {
    return Promise.reject(new ShelfCacheNotConfiguredError());
  }
}

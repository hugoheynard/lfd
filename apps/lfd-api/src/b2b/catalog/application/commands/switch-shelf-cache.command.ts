import type { ShelfSwitchAction } from "../../domain/ports/shop-shelf-switch.js";

/**
 * Éteindre, rallumer ou vider le cache des rayons pro en production, sans
 * redéployer (`plan-cache-du-catalogue.md`, « L'interrupteur »).
 */
export class SwitchShelfCacheCommand {
  constructor(readonly action: ShelfSwitchAction) {}
}

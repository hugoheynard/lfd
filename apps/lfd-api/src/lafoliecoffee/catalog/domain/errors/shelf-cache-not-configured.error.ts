import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * L'interrupteur a été actionné là où aucun magasin des rayons pro n'est
 * configuré (`SHOP_SHELF_CACHE_URL` absente : dev local hors wrangler, e2e).
 * Chaque rayon y est déjà calculé depuis la base : il n'y a rien à éteindre.
 */
export class ShelfCacheNotConfiguredError extends BusinessError {
  constructor() {
    super(
      "catalog.shelf_cache.not_configured",
      "Le cache des rayons pro n'est pas configuré sur cette instance (SHOP_SHELF_CACHE_URL absente) : " +
        "chaque rayon est déjà calculé depuis la base, il n'y a rien à éteindre, rallumer ni vider. " +
        "En production, le Worker pose cette adresse ; vérifier que l'appel vise bien l'API déployée.",
    );
  }
}

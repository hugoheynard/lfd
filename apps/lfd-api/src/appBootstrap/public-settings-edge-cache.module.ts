import { Global, Module } from "@nestjs/common";

import { PublicSettingsEdgeCache } from "../lafoliecoffee/shared/public-settings-cache/domain/ports/public-settings-edge-cache.js";
import { InternalPublicSettingsEdgeCache } from "../lafoliecoffee/shared/public-settings-cache/infrastructure/internal-public-settings-edge-cache.js";
import { NoPublicSettingsEdgeCache } from "../lafoliecoffee/shared/public-settings-cache/infrastructure/no-public-settings-edge-cache.js";
import { AppConfig } from "../platform/config/app-config.js";

/**
 * **La purge des réglages publics** (2026-11-05) : pied de page, ouverture
 * des commandes, zones et disponibilité de livraison.
 *
 * `@Global` pour la raison de `ShelfChangesModule` : les écrivains vivent dans
 * quatre contextes du commerce, et aucun ne doit importer un module qui ne
 * le concerne pas.
 *
 * Le Worker pose `SHOP_SHELF_CACHE_URL` : son chemin interne est aussi celui
 * de la purge de Workers Cache. Sans lui (dev local, e2e), aucune bordure.
 */
@Global()
@Module({
  providers: [
    {
      provide: PublicSettingsEdgeCache,
      inject: [AppConfig],
      useFactory: (config: AppConfig): PublicSettingsEdgeCache => {
        const url = config.shopShelfCacheUrl();
        return url === null
          ? new NoPublicSettingsEdgeCache()
          : new InternalPublicSettingsEdgeCache(url);
      },
    },
  ],
  exports: [PublicSettingsEdgeCache],
})
export class PublicSettingsEdgeCacheModule {}

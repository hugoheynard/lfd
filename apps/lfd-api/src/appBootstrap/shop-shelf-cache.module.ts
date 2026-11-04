import { Global, Module } from "@nestjs/common";

import { ProShelfPurge } from "../b2b/catalog/application/pro-shelf-purge.js";
import { ResilientShopShelfCache } from "../b2b/catalog/application/resilient-shop-shelf-cache.js";
import { ShelfCacheSignals } from "../b2b/catalog/domain/ports/shelf-cache-signals.js";
import { ShelfCallDeadline } from "../b2b/catalog/domain/ports/shelf-call-deadline.js";
import { ShopShelfCache } from "../b2b/catalog/domain/ports/shop-shelf-cache.js";
import { ShopShelfEraser } from "../b2b/catalog/domain/ports/shop-shelf-eraser.js";
import { DurableObjectShopShelfCache } from "../b2b/catalog/infrastructure/durable-object-shop-shelf-cache.js";
import { LoggingShelfCacheSignals } from "../b2b/catalog/infrastructure/logging-shelf-cache-signals.js";
import { NoShopShelfCache } from "../b2b/catalog/infrastructure/no-shop-shelf-cache.js";
import { NodeShelfCallDeadline } from "../b2b/catalog/infrastructure/node-shelf-call-deadline.js";
import { AppConfig } from "../platform/config/app-config.js";

/**
 * **Le magasin des rayons pro** (`documentation/pricing/moteur/plan-cache-du-catalogue.md`, C2).
 *
 * Le choix du magasin est un fait de déploiement, donc il se fait ici : le
 * Durable Object quand la configuration le nomme (le Worker pose
 * `SHOP_SHELF_CACHE_URL`), sinon « sans magasin » — chaque rayon calculé
 * depuis la base, comme avant C2.
 *
 * 🔴 Lecture et effacement pointent la MÊME instance (`useExisting`) : deux
 * `useFactory` feraient deux magasins en mémoire le jour où l'un l'est.
 *
 * `@Global` parce que deux consommateurs vivent dans deux modules qui ne se
 * connaissent pas : le rayon reconnu (`CatalogModule`) et la purge
 * (`ShelfChangesModule`).
 */
@Global()
@Module({
  providers: [
    {
      provide: ShopShelfCache,
      inject: [AppConfig],
      useFactory: (config: AppConfig): ShopShelfCache => {
        const url = config.shopShelfCacheUrl();
        return url === null ? new NoShopShelfCache() : new DurableObjectShopShelfCache(url);
      },
    },
    { provide: ShopShelfEraser, useExisting: ShopShelfCache },
    { provide: ShelfCallDeadline, useClass: NodeShelfCallDeadline },
    { provide: ShelfCacheSignals, useClass: LoggingShelfCacheSignals },
    ResilientShopShelfCache,
    ProShelfPurge,
  ],
  exports: [ResilientShopShelfCache, ProShelfPurge],
})
export class ShopShelfCacheModule {}

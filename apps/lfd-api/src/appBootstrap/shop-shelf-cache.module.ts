import { Global, Module } from "@nestjs/common";

import { ProShelfPurge } from "../b2b/catalog/application/pro-shelf-purge.js";
import { PublicShelfCacheability } from "../b2b/catalog/application/public-shelf-cacheability.js";
import { PublicShelfFlagMemory } from "../b2b/catalog/application/public-shelf-flag-memory.js";
import { PublicShelfPurge } from "../b2b/catalog/application/public-shelf-purge.js";
import { ResilientPublicShelf } from "../b2b/catalog/application/resilient-public-shelf.js";
import { ResilientShopShelfCache } from "../b2b/catalog/application/resilient-shop-shelf-cache.js";
import { ShelfCallGuard } from "../b2b/catalog/application/shelf-call-guard.js";
import { PublicShelfEraser } from "../b2b/catalog/domain/ports/public-shelf-eraser.js";
import { PublicShelfStateReader } from "../b2b/catalog/domain/ports/public-shelf-state.reader.js";
import { ShelfCacheSignals } from "../b2b/catalog/domain/ports/shelf-cache-signals.js";
import { ShelfCallDeadline } from "../b2b/catalog/domain/ports/shelf-call-deadline.js";
import { ShopShelfCache } from "../b2b/catalog/domain/ports/shop-shelf-cache.js";
import { ShopShelfEraser } from "../b2b/catalog/domain/ports/shop-shelf-eraser.js";
import { ShopShelfSwitch } from "../b2b/catalog/domain/ports/shop-shelf-switch.js";
import { DurableObjectShopShelfSwitch } from "../b2b/catalog/infrastructure/durable-object-shop-shelf-switch.js";
import { NoShopShelfSwitch } from "../b2b/catalog/infrastructure/no-shop-shelf-switch.js";
import { DurableObjectShopShelfCache } from "../b2b/catalog/infrastructure/durable-object-shop-shelf-cache.js";
import { InternalPublicShelf } from "../b2b/catalog/infrastructure/internal-public-shelf.js";
import { NoPublicShelf } from "../b2b/catalog/infrastructure/no-public-shelf.js";
import { LoggingShelfCacheSignals } from "../b2b/catalog/infrastructure/logging-shelf-cache-signals.js";
import { NoShopShelfCache } from "../b2b/catalog/infrastructure/no-shop-shelf-cache.js";
import { NodeShelfCallDeadline } from "../b2b/catalog/infrastructure/node-shelf-call-deadline.js";
import { AppConfig } from "../platform/config/app-config.js";

/**
 * **Le magasin des rayons pro** (`documentation/caching-usage/plan-cache-du-catalogue.md`, C2).
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
 *
 * Le rayon public (C3) suit le même choix : l'état et la purge par le même
 * chemin interne, ou « sans magasin » — drapeau éteint, rien ne se garde.
 * UN `ShelfCallGuard` pour les deux : un seul chemin, un seul disjoncteur.
 */
@Global()
@Module({
  providers: [
    {
      provide: ShopShelfCache,
      inject: [AppConfig],
      useFactory: (config: AppConfig): ShopShelfCache => {
        const url = config.shopShelfCacheUrl();
        return url === null
          ? new NoShopShelfCache()
          : new DurableObjectShopShelfCache(url, config.revision());
      },
    },
    { provide: ShopShelfEraser, useExisting: ShopShelfCache },
    {
      // L'interrupteur suit le même choix ; sans état en mémoire, une instance
      // à part ne dédouble rien : l'état vit dans l'objet.
      provide: ShopShelfSwitch,
      inject: [AppConfig],
      useFactory: (config: AppConfig): ShopShelfSwitch => {
        const url = config.shopShelfCacheUrl();
        return url === null ? new NoShopShelfSwitch() : new DurableObjectShopShelfSwitch(url);
      },
    },
    {
      provide: PublicShelfStateReader,
      inject: [AppConfig],
      useFactory: (config: AppConfig): PublicShelfStateReader => {
        const url = config.shopShelfCacheUrl();
        return url === null ? new NoPublicShelf() : new InternalPublicShelf(url);
      },
    },
    { provide: PublicShelfEraser, useExisting: PublicShelfStateReader },
    { provide: ShelfCallDeadline, useClass: NodeShelfCallDeadline },
    { provide: ShelfCacheSignals, useClass: LoggingShelfCacheSignals },
    ShelfCallGuard,
    ResilientShopShelfCache,
    PublicShelfFlagMemory,
    ResilientPublicShelf,
    PublicShelfCacheability,
    ProShelfPurge,
    PublicShelfPurge,
  ],
  exports: [
    ResilientShopShelfCache,
    ResilientPublicShelf,
    PublicShelfCacheability,
    ProShelfPurge,
    PublicShelfPurge,
    ShopShelfSwitch,
    ShelfCacheSignals,
  ],
})
export class ShopShelfCacheModule {}

import { Global, Module } from "@nestjs/common";

import { ProShelfPurge } from "../lafoliecoffee/catalog/application/pro-shelf-purge.js";
import { PublicShelfCacheability } from "../lafoliecoffee/catalog/application/public-shelf-cacheability.js";
import { PublicShelfFlagMemory } from "../lafoliecoffee/catalog/application/public-shelf-flag-memory.js";
import { PublicShelfPurge } from "../lafoliecoffee/catalog/application/public-shelf-purge.js";
import { ResilientPublicShelf } from "../lafoliecoffee/catalog/application/resilient-public-shelf.js";
import { ResilientShopShelfCache } from "../lafoliecoffee/catalog/application/resilient-shop-shelf-cache.js";
import { ShelfCallGuard } from "../lafoliecoffee/catalog/application/shelf-call-guard.js";
import { PublicShelfEraser } from "../lafoliecoffee/catalog/domain/ports/public-shelf-eraser.js";
import { PublicShelfStateReader } from "../lafoliecoffee/catalog/domain/ports/public-shelf-state.reader.js";
import { ShelfCacheSignals } from "../lafoliecoffee/catalog/domain/ports/shelf-cache-signals.js";
import { ShelfCallDeadline } from "../lafoliecoffee/catalog/domain/ports/shelf-call-deadline.js";
import { ShopShelfCache } from "../lafoliecoffee/catalog/domain/ports/shop-shelf-cache.js";
import { ShopShelfEraser } from "../lafoliecoffee/catalog/domain/ports/shop-shelf-eraser.js";
import { ShopShelfSwitch } from "../lafoliecoffee/catalog/domain/ports/shop-shelf-switch.js";
import { DurableObjectShopShelfSwitch } from "../lafoliecoffee/catalog/infrastructure/durable-object-shop-shelf-switch.js";
import { NoShopShelfSwitch } from "../lafoliecoffee/catalog/infrastructure/no-shop-shelf-switch.js";
import { DurableObjectShopShelfCache } from "../lafoliecoffee/catalog/infrastructure/durable-object-shop-shelf-cache.js";
import { InternalPublicShelf } from "../lafoliecoffee/catalog/infrastructure/internal-public-shelf.js";
import { NoPublicShelf } from "../lafoliecoffee/catalog/infrastructure/no-public-shelf.js";
import { CountingShelfCacheSignals } from "../lafoliecoffee/catalog/infrastructure/counting-shelf-cache-signals.js";
import { LoggingShelfCacheSignals } from "../lafoliecoffee/catalog/infrastructure/logging-shelf-cache-signals.js";
import { NoShopShelfCache } from "../lafoliecoffee/catalog/infrastructure/no-shop-shelf-cache.js";
import { NodeShelfCallDeadline } from "../lafoliecoffee/catalog/infrastructure/node-shelf-call-deadline.js";
import { AppConfig } from "../platform/config/app-config.js";

/**
 * **Le magasin des rayons pro** (`documentation/caching-usage/le-rayon-en-cache.md`, C2).
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
    // Journalisés ET comptés pour la carte de santé (C5) : le compteur
    // enveloppe le journal, qui reste tel quel.
    LoggingShelfCacheSignals,
    { provide: ShelfCacheSignals, useClass: CountingShelfCacheSignals },
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

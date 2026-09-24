import { Module } from "@nestjs/common";

import { CatalogModule } from "../catalog/catalog.module.js";

import { GetStorefrontCatalogHandler } from "./application/get-storefront-catalog.handler.js";
import { GetPublicStorefrontPageHandler } from "./application/get-public-storefront-page.handler.js";
import { GetStorefrontHandler } from "./application/get-storefront.handler.js";
import { SaveStorefrontHandler } from "./application/save-storefront.handler.js";
import { StorefrontMediaUsage } from "./channels/media/storefront-media-usage.js";
import { PublicStorefrontReader } from "./domain/public-storefront.reader.js";
import { StorefrontCatalogReader } from "./domain/storefront-catalog.reader.js";
import { StorefrontReader } from "./domain/storefront.reader.js";
import { StorefrontRepository } from "./domain/storefront.repository.js";
import { AdminStorefrontController } from "./http/admin-storefront.controller.js";
import { StorefrontController } from "./http/storefront.controller.js";
import { CatalogBackedStorefrontCatalogReader } from "./infrastructure/catalog-backed-storefront-catalog.reader.js";
import { PrismaPublicStorefrontReader } from "./infrastructure/prisma-public-storefront.reader.js";
import { PrismaStorefrontMediaUsage } from "./infrastructure/prisma-storefront-media-usage.js";
import { PrismaStorefrontReader } from "./infrastructure/prisma-storefront.reader.js";
import { PrismaStorefrontRepository } from "./infrastructure/prisma-storefront.repository.js";

/**
 * **La vitrine** — les pages composées de la boutique (plan
 * `documentation/order/plan-vitrine-enregistrement.md`).
 *
 * Quatre ports, un par consommateur (ISP) : l'écriture prend l'agrégat entier,
 * l'éditeur lit tout, la boutique lit la page d'un rayon — et l'éditeur lit le
 * catalogue par `StorefrontCatalogReader`, branché sur `CatalogAdminReader` :
 * une lecture murée par `b2b_storefront`, que la communication peut ouvrir,
 * sans prix ni réglages. Et un canal publié,
 * `channels/media/` : les images qu'emploie la vitrine, que `appBootstrap/`
 * branche sur la médiathèque (D9).
 */
@Module({
  imports: [CatalogModule],
  controllers: [AdminStorefrontController, StorefrontController],
  providers: [
    { provide: StorefrontRepository, useClass: PrismaStorefrontRepository },
    { provide: StorefrontReader, useClass: PrismaStorefrontReader },
    { provide: PublicStorefrontReader, useClass: PrismaPublicStorefrontReader },
    { provide: StorefrontMediaUsage, useClass: PrismaStorefrontMediaUsage },
    { provide: StorefrontCatalogReader, useClass: CatalogBackedStorefrontCatalogReader },
    SaveStorefrontHandler,
    GetStorefrontHandler,
    GetPublicStorefrontPageHandler,
    GetStorefrontCatalogHandler,
  ],
  exports: [StorefrontMediaUsage],
})
export class StorefrontModule {}

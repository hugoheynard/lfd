import { Module } from "@nestjs/common";

import { GetPublicStorefrontPageHandler } from "./application/get-public-storefront-page.handler.js";
import { GetStorefrontHandler } from "./application/get-storefront.handler.js";
import { SaveStorefrontHandler } from "./application/save-storefront.handler.js";
import { StorefrontMediaUsage } from "./channels/media/storefront-media-usage.js";
import { PublicStorefrontReader } from "./domain/public-storefront.reader.js";
import { StorefrontReader } from "./domain/storefront.reader.js";
import { StorefrontRepository } from "./domain/storefront.repository.js";
import { AdminStorefrontController } from "./http/admin-storefront.controller.js";
import { StorefrontController } from "./http/storefront.controller.js";
import { PrismaPublicStorefrontReader } from "./infrastructure/prisma-public-storefront.reader.js";
import { PrismaStorefrontMediaUsage } from "./infrastructure/prisma-storefront-media-usage.js";
import { PrismaStorefrontReader } from "./infrastructure/prisma-storefront.reader.js";
import { PrismaStorefrontRepository } from "./infrastructure/prisma-storefront.repository.js";

/**
 * **La vitrine** — les pages composées de la boutique (plan
 * `documentation/order/plan-vitrine-enregistrement.md`).
 *
 * Trois ports, un par consommateur (ISP) : l'écriture prend l'agrégat entier,
 * l'éditeur lit tout, la boutique lit la page d'un rayon. Et un canal publié,
 * `channels/media/` : les images qu'emploie la vitrine, que `appBootstrap/`
 * branche sur la médiathèque (D9).
 */
@Module({
  controllers: [AdminStorefrontController, StorefrontController],
  providers: [
    { provide: StorefrontRepository, useClass: PrismaStorefrontRepository },
    { provide: StorefrontReader, useClass: PrismaStorefrontReader },
    { provide: PublicStorefrontReader, useClass: PrismaPublicStorefrontReader },
    { provide: StorefrontMediaUsage, useClass: PrismaStorefrontMediaUsage },
    SaveStorefrontHandler,
    GetStorefrontHandler,
    GetPublicStorefrontPageHandler,
  ],
  exports: [StorefrontMediaUsage],
})
export class StorefrontModule {}

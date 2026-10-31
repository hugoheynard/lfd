import { Module } from "@nestjs/common";

import { CatalogModule } from "../catalog/catalog.module.js";
import { PricingModule } from "../pricing/pricing.module.js";
import { ArchivePromotionHandler } from "./application/commands/archive-promotion.handler.js";
import { PausePromotionHandler } from "./application/commands/pause-promotion.handler.js";
import { PosePromotionHandler } from "./application/commands/pose-promotion.handler.js";
import { PromotionFulfillmentNames } from "./application/commands/promotion-fulfillment-names.js";
import { PromotionWriteGuard } from "./application/commands/promotion-write-guard.js";
import { ResumePromotionHandler } from "./application/commands/resume-promotion.handler.js";
import { RevisePromotionHandler } from "./application/commands/revise-promotion.handler.js";
import { GetPromotionHandler } from "./application/queries/get-promotion.handler.js";
import { GetPromotionsSourceHandler } from "./application/queries/get-promotions-source.handler.js";
import { ListPromotionsHandler } from "./application/queries/list-promotions.handler.js";
import { PromotionBrowser } from "./domain/ports/promotion-browser.reader.js";
import { PromotionRivalsReader } from "./domain/ports/promotion-rivals.reader.js";
import { PromotionRepository } from "./domain/ports/promotion.repository.js";
import { AdminPromotionsController } from "./http/admin-promotions.controller.js";
import {
  PrismaPromotionBrowser,
  PrismaPromotionRivalsReader,
} from "./infrastructure/prisma-promotion-browser.readers.js";
import { PrismaPromotionRepository } from "./infrastructure/prisma-promotion.repository.js";

/**
 * **Les promotions** (plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`) :
 * l'agrégat, son dépôt et ses cinq gestes (L3), l'écran et ses refus (L7),
 * son ouverture à la bascule (L8).
 *
 * Les lecteurs du CALCUL sont liés dans `PricingModule` (sous le cache des
 * matériaux) ; on en importe la source, que le verrou « avant la bascule »
 * lit. Le catalogue vendable vient de `CatalogModule`, qui possède la table.
 */
@Module({
  imports: [PricingModule, CatalogModule],
  controllers: [AdminPromotionsController],
  providers: [
    { provide: PromotionRepository, useClass: PrismaPromotionRepository },
    { provide: PromotionBrowser, useClass: PrismaPromotionBrowser },
    { provide: PromotionRivalsReader, useClass: PrismaPromotionRivalsReader },
    PromotionWriteGuard,
    // Les ports qu'il lit sont liés par `appBootstrap` (`PromotionFulfillmentTargetsModule`).
    PromotionFulfillmentNames,
    PosePromotionHandler,
    RevisePromotionHandler,
    PausePromotionHandler,
    ResumePromotionHandler,
    ArchivePromotionHandler,
    ListPromotionsHandler,
    GetPromotionHandler,
    GetPromotionsSourceHandler,
  ],
})
export class PromotionsModule {}

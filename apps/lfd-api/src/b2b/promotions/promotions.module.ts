import { Module } from "@nestjs/common";

import { ArchivePromotionHandler } from "./application/commands/archive-promotion.handler.js";
import { PausePromotionHandler } from "./application/commands/pause-promotion.handler.js";
import { PosePromotionHandler } from "./application/commands/pose-promotion.handler.js";
import { ResumePromotionHandler } from "./application/commands/resume-promotion.handler.js";
import { RevisePromotionHandler } from "./application/commands/revise-promotion.handler.js";
import { PromotionRepository } from "./domain/ports/promotion.repository.js";
import { PrismaPromotionRepository } from "./infrastructure/prisma-promotion.repository.js";

/**
 * **Les promotions** (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * lot L3) : l'agrégat, son dépôt et ses cinq gestes. Aucun contrôleur — l'écran
 * est le lot L7 — et aucun lecteur de prix : rien n'exporte d'ici avant L5.
 */
@Module({
  providers: [
    { provide: PromotionRepository, useClass: PrismaPromotionRepository },
    PosePromotionHandler,
    RevisePromotionHandler,
    PausePromotionHandler,
    ResumePromotionHandler,
    ArchivePromotionHandler,
  ],
})
export class PromotionsModule {}

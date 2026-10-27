import { Module } from "@nestjs/common";

import { AllergensModule } from "../../allergens/allergens.module.js";
import { CatalogueModule } from "../../catalogue/catalogue.module.js";
import { OrderTimeLimitationModule } from "../../order-time-limitation/order-time-limitation.module.js";
import { PimDatabaseModule } from "../../infra/database/pim-database.module.js";
import { CatalogReemissionRunner } from "./application/catalog-reemission-runner.js";
import { GetCatalogReemissionHandler } from "./application/get-catalog-reemission.js";
import { GetLatestCatalogReemissionHandler } from "./application/get-latest-catalog-reemission.js";
import { InterruptOrphanReemissionsHandler } from "./application/interrupt-orphan-reemissions.js";
import { StartCatalogReemissionHandler } from "./application/start-catalog-reemission.js";
import { ReemissionJobReader } from "./domain/ports/reemission-job.reader.js";
import { ReemissionJobRepository } from "./domain/ports/reemission-job.repository.js";
import { B2bReemitController } from "./http/reemit.controller.js";
import { PrismaReemissionJobReader } from "./infrastructure/prisma-reemission-job.reader.js";
import { PrismaReemissionJobRepository } from "./infrastructure/prisma-reemission-job.repository.js";
import { ReemissionRecoveryOnBoot } from "./infrastructure/reemission-recovery.on-boot.js";

/**
 * Adaptateur du canal **plateforme B2B** — le second canal, après l'ancien canal de vente en ligne.
 *
 * Même règle qu'ailleurs (ADR-13) : il **dépend** du catalogue, jamais l'inverse.
 * Supprimer ce module ne casserait rien en amont ; c'est le test qui dit que la
 * frontière tient.
 *
 * Il ne porte plus que la **réémission** des faits du catalogue — un travail
 * suivi depuis le 2026-10-18, rangé dans `pim.catalog_reemission_job`. Partis en X4
 * (`documentation/catalogue/catalogue-synchronise.md` §6) : l'appartenance au
 * canal par fiche, la bascule vers l'audience qui la lisait, et le port des
 * opérations que le commerce lisait pour les reprendre.
 *
 * Préfixe monté par `AppModule` via `RouterModule` (`channels/b2b`) : les
 * contrôleurs ne déclarent que leur sous-chemin.
 */
@Module({
  imports: [OrderTimeLimitationModule, PimDatabaseModule, CatalogueModule, AllergensModule],
  controllers: [B2bReemitController],
  providers: [
    { provide: ReemissionJobRepository, useClass: PrismaReemissionJobRepository },
    { provide: ReemissionJobReader, useClass: PrismaReemissionJobReader },
    CatalogReemissionRunner,
    StartCatalogReemissionHandler,
    InterruptOrphanReemissionsHandler,
    GetLatestCatalogReemissionHandler,
    GetCatalogReemissionHandler,
    ReemissionRecoveryOnBoot,
  ],
})
export class B2bPlatformModule {}

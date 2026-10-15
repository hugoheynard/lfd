import { Module } from "@nestjs/common";

import { ArchiveOperationHandler } from "./application/commands/archive-operation.handler.js";
import { ChangeOperationAudienceHandler } from "./application/commands/change-operation-audience.handler.js";
import { EditOperationHandler } from "./application/commands/edit-operation.handler.js";
import { PrepareOperationHandler } from "./application/commands/prepare-operation.handler.js";
import { RefocusOperationImageHandler } from "./application/commands/refocus-operation-image.handler.js";
import { RescheduleOperationHandler } from "./application/commands/reschedule-operation.handler.js";
import { SetOperationSelectionHandler } from "./application/commands/set-operation-selection.handler.js";
import { SetOperationVisibilityHandler } from "./application/commands/set-operation-visibility.handler.js";
import { RepointOperationImage } from "./application/repoint-operation-image.js";
import { OperationImageRepointing } from "./channels/media/operation-image-repointing.js";
import { OperationMediaUsage } from "./channels/media/operation-media-usage.js";
import { OperationRepository } from "./domain/ports/operation.repository.js";
import { OperationSkuCatalogue } from "./domain/ports/operation-sku.catalogue.js";
import { OperationWritingSwitch } from "./domain/ports/operation-writing-switch.js";
import { AdminOperationsController } from "./http/admin-operations.controller.js";
import { ConfigOperationWritingSwitch } from "./infrastructure/config-operation-writing.switch.js";
import { PrismaOperationMediaUsage } from "./infrastructure/prisma-operation-media-usage.js";
import { PrismaOperationRepository } from "./infrastructure/prisma-operation.repository.js";
import { PrismaOperationSkuCatalogue } from "./infrastructure/prisma-operation-sku.catalogue.js";

/**
 * **Les opérations datées, tenues au commerce** — le contexte qui devient leur
 * source (`documentation/operations-datees/plan-l-operation-passe-au-commerce.md`,
 * O1, lot 1).
 *
 * Un contexte à part de `catalog/`, et non un sous-dossier : `catalog/` porte
 * déjà le miroir, la surcharge, l'ingestion et la vente des opérations, et
 * l'agrégat qui ÉCRIT n'a pas les mêmes raisons de changer que ce qui LIT.
 * Il écrit dans les tables du miroir (`catalog_operations`), qui deviennent
 * la source : aucune table neuve.
 *
 * N'exporte que son canal vers la médiathèque (lot 2, O3) : compter et
 * repointer ses images, que `appBootstrap/media-carriers.module.ts` ne
 * branche qu'interrupteur OUVERT. Le port « décris-moi cette image »
 * (`OperationImageLibrary`) lui est fourni par `OperationImageLibraryModule`,
 * global. Les lectures du miroir ne changent pas.
 */
@Module({
  controllers: [AdminOperationsController],
  providers: [
    { provide: OperationRepository, useClass: PrismaOperationRepository },
    { provide: OperationSkuCatalogue, useClass: PrismaOperationSkuCatalogue },
    { provide: OperationWritingSwitch, useClass: ConfigOperationWritingSwitch },
    PrepareOperationHandler,
    EditOperationHandler,
    RescheduleOperationHandler,
    ChangeOperationAudienceHandler,
    SetOperationVisibilityHandler,
    SetOperationSelectionHandler,
    ArchiveOperationHandler,
    RefocusOperationImageHandler,
    { provide: OperationMediaUsage, useClass: PrismaOperationMediaUsage },
    { provide: OperationImageRepointing, useClass: RepointOperationImage },
  ],
  exports: [OperationMediaUsage, OperationImageRepointing],
})
export class CommerceOperationsModule {}

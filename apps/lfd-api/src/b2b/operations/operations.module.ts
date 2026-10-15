import { Module } from "@nestjs/common";

import { ArchiveOperationHandler } from "./application/commands/archive-operation.handler.js";
import { ChangeOperationAudienceHandler } from "./application/commands/change-operation-audience.handler.js";
import { EditOperationHandler } from "./application/commands/edit-operation.handler.js";
import { PrepareOperationHandler } from "./application/commands/prepare-operation.handler.js";
import { RescheduleOperationHandler } from "./application/commands/reschedule-operation.handler.js";
import { SetOperationSelectionHandler } from "./application/commands/set-operation-selection.handler.js";
import { SetOperationVisibilityHandler } from "./application/commands/set-operation-visibility.handler.js";
import { OperationRepository } from "./domain/ports/operation.repository.js";
import { OperationSkuCatalogue } from "./domain/ports/operation-sku.catalogue.js";
import { OperationWritingSwitch } from "./domain/ports/operation-writing-switch.js";
import { AdminOperationsController } from "./http/admin-operations.controller.js";
import { ConfigOperationWritingSwitch } from "./infrastructure/config-operation-writing.switch.js";
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
 * N'exporte rien : au lot 1, personne ne lit cet agrégat — les lectures du
 * miroir ne changent pas.
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
  ],
})
export class CommerceOperationsModule {}

import { Module } from "@nestjs/common";

import { PimDatabaseModule } from "../infra/database/pim-database.module.js";
import { ArchiveOperationHandler } from "./application/archive-operation.js";
import { ChangeOperationAudienceHandler } from "./application/change-operation-audience.js";
import { EditOperationHandler } from "./application/edit-operation.js";
import { GetOperationHandler } from "./application/get-operation.js";
import { ListOperationsHandler } from "./application/list-operations.js";
import { OnMediaAssetDescribedForOperationsHandler } from "./application/on-media-asset-described.js";
import { PrepareOperationHandler } from "./application/prepare-operation.js";
import { RescheduleOperationHandler } from "./application/reschedule-operation.js";
import { SetOperationSelectionHandler } from "./application/set-operation-selection.js";
import { OperationImageUsage } from "./domain/ports/operation-image-usage.js";
import { OperationSkuCatalogue } from "./domain/ports/operation-sku.catalogue.js";
import { OperationReader } from "./domain/ports/operation.reader.js";
import { OperationRepository } from "./domain/ports/operation.repository.js";
import { ReferentialOperationWriting } from "./domain/ports/referential-operation-writing.js";
import { OperationController } from "./http/operation.controller.js";
import { ConfigReferentialOperationWriting } from "./infrastructure/config-referential-operation-writing.js";
import { PrismaOperationImageUsage } from "./infrastructure/prisma-operation-image-usage.js";
import { PrismaOperationSkuCatalogue } from "./infrastructure/prisma-operation-sku.catalogue.js";
import { PrismaOperationReader } from "./infrastructure/prisma-operation.reader.js";
import { PrismaOperationRepository } from "./infrastructure/prisma-operation.repository.js";

/**
 * Contexte **operations** — les opérations datées : Noël, Pâques, la galette
 * (`documentation/operations-datees/architecture-operations-datees.md`).
 *
 * Dans le référentiel parce que préparer Noël, c'est choisir des articles et
 * fixer des dates : le travail du catalogue (D1).
 *
 * Il n'exporte que son port de LECTURE, depuis le lot 2 : le canal de la
 * plateforme projette les opérations dans le fil v11, et il n'a pas à pouvoir
 * en écrire une (ISP).
 */
@Module({
  imports: [PimDatabaseModule],
  controllers: [OperationController],
  providers: [
    { provide: OperationRepository, useClass: PrismaOperationRepository },
    { provide: OperationReader, useClass: PrismaOperationReader },
    { provide: OperationSkuCatalogue, useClass: PrismaOperationSkuCatalogue },
    // Fermée à la bascule (lot 3 de `plan-l-operation-passe-au-commerce.md`) :
    // les opérations s'écrivent alors au commerce.
    { provide: ReferentialOperationWriting, useClass: ConfigReferentialOperationWriting },
    PrepareOperationHandler,
    EditOperationHandler,
    RescheduleOperationHandler,
    ChangeOperationAudienceHandler,
    SetOperationSelectionHandler,
    ArchiveOperationHandler,
    ListOperationsHandler,
    GetOperationHandler,
    // L'image d'une opération suit la médiathèque sans push (mediatheque.md §7 bis).
    { provide: OperationImageUsage, useClass: PrismaOperationImageUsage },
    OnMediaAssetDescribedForOperationsHandler,
  ],
  exports: [OperationReader],
})
export class OperationsModule {}

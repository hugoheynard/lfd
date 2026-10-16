import { Module } from "@nestjs/common";

import { B2bPlatformModule } from "../../pim/channels/b2b-platform/b2b-platform.module.js";
import { CatalogModule } from "../catalog/catalog.module.js";
import { ApplyOperationsMigrationHandler } from "./application/commands/apply-operations-migration.handler.js";
import { GetOperationHandler } from "./application/queries/get-operation.handler.js";
import { ListOperationsHandler } from "./application/queries/list-operations.handler.js";
import { PreviewOperationsMigrationHandler } from "./application/queries/preview-operations-migration.handler.js";
import { MirroredOperationsReader } from "./domain/ports/mirrored-operations.reader.js";
import { OperationAdoption } from "./domain/ports/operation-adoption.js";
import { OperationReader } from "./domain/ports/operation.reader.js";
import { OperationSaleReader } from "./domain/ports/operation-sale.reader.js";
import { CatalogBackedOperationSaleReader } from "./infrastructure/catalog-backed-operation-sale.reader.js";
import { PrismaMirroredOperationsReader } from "./infrastructure/prisma-mirrored-operations.reader.js";
import { PrismaOperationAdoption } from "./infrastructure/prisma-operation-adoption.js";
import { PrismaOperationReader } from "./infrastructure/prisma-operation.reader.js";
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
 *
 * Lot 3 — les lectures de l'écran, et la migration depuis le référentiel :
 * `B2bPlatformModule` pour le SEUL port que le référentiel publie pour elle
 * (`ReferentialOperations`, la surface `b2b → pim` permise), `CatalogModule`
 * pour « en vente » (`CatalogAdminReader`).
 */
@Module({
  imports: [B2bPlatformModule, CatalogModule],
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
    { provide: OperationReader, useClass: PrismaOperationReader },
    { provide: OperationSaleReader, useClass: CatalogBackedOperationSaleReader },
    ListOperationsHandler,
    GetOperationHandler,
    { provide: MirroredOperationsReader, useClass: PrismaMirroredOperationsReader },
    { provide: OperationAdoption, useClass: PrismaOperationAdoption },
    PreviewOperationsMigrationHandler,
    ApplyOperationsMigrationHandler,
    { provide: OperationMediaUsage, useClass: PrismaOperationMediaUsage },
    { provide: OperationImageRepointing, useClass: RepointOperationImage },
  ],
  exports: [OperationMediaUsage, OperationImageRepointing],
})
export class CommerceOperationsModule {}

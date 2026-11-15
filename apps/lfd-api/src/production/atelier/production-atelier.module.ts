import { Module } from "@nestjs/common";

import { BrandModule } from "../../platform/brand/brand.module.js";
import { DayVersionsModule } from "../../platform/day-versions/day-versions.module.js";
import { ProductionDayModule } from "../day/production-day.module.js";
import { ProductionQualityModule } from "../quality/production-quality.module.js";
import { ProductionPrintModule } from "../shared/print/production-print.module.js";
import { CancelBatchHandler } from "./application/commands/cancel-batch.handler.js";
import { RecordBatchHandler } from "./application/commands/record-batch.handler.js";
import { RemoveProductionContainerHandler } from "./application/commands/remove-production-container.handler.js";
import { SetProductionContainerHandler } from "./application/commands/set-production-container.handler.js";
import { SetProductionDisplayHandler } from "./application/commands/set-production-display.handler.js";
import { GetAtelierSheetSpecimenHandler } from "./application/queries/get-atelier-sheet-specimen.handler.js";
import { GetCurrentProductionWorksheetHandler } from "./application/queries/get-current-production-worksheet.handler.js";
import { GetProductionWorksheetHandler } from "./application/queries/get-production-worksheet.handler.js";
import { ListProductionContainersHandler } from "./application/queries/list-production-containers.handler.js";
import { PackingHandoffs } from "./application/services/packing-handoffs.service.js";
import { ProductionWorksheetReading } from "./application/services/production-worksheet-reading.service.js";
import { WorksheetContents } from "./application/services/worksheet-contents.service.js";
import { WorksheetDeadlinesReading } from "./application/services/worksheet-deadlines-reading.service.js";
import { ProductionContainerReader } from "./domain/ports/production-container.reader.js";
import { ProductionContainerRepository } from "./domain/ports/production-container.repository.js";
import { AdminAtelierSheetSpecimenController } from "./http/admin-atelier-sheet-specimen.controller.js";
import { ProductionAtelierSheetController } from "./http/production-atelier-sheet.controller.js";
import { ProductionDisplaySettingsController } from "./http/production-display-settings.controller.js";
import { ProductionSupervisionController } from "./http/production-supervision.controller.js";
import { ProductionWorksheetController } from "./http/production-worksheet.controller.js";
import {
  PrismaProductionContainerReader,
  PrismaProductionContainerRepository,
} from "./infrastructure/prisma-production-container.repository.js";
import { ProductionBatchShortcutsModule } from "./production-batch-shortcuts.module.js";

/**
 * **L'atelier** : les fournées, la fiche d'atelier, les contenants, l'affichage
 * et les raccourcis (`documentation/fournil/la-fiche-d-atelier.md`).
 *
 * Il lit la journée, les pastilles de la qualité et l'imprimerie
 * (`shared/print/`), les seuls modules du fournil qu'il a le droit
 * d'importer. Il n'exporte rien.
 */
@Module({
  imports: [
    ProductionDayModule,
    ProductionQualityModule,
    // L'imprimerie : les réglages d'affichage, lus par la fiche et réglés ici.
    ProductionPrintModule,
    // Les articles des raccourcis viennent du canal `channels/commerce/`, global.
    ProductionBatchShortcutsModule,
    // Le logo de l'exemplaire de la fiche ; les contenus versionnés de la fiche.
    BrandModule,
    DayVersionsModule,
  ],
  controllers: [
    ProductionAtelierSheetController,
    ProductionWorksheetController,
    ProductionSupervisionController,
    ProductionDisplaySettingsController,
    // La fiche d'atelier d'EXEMPLE de la planche des documents.
    AdminAtelierSheetSpecimenController,
  ],
  providers: [
    RecordBatchHandler,
    CancelBatchHandler,
    SetProductionContainerHandler,
    RemoveProductionContainerHandler,
    GetProductionWorksheetHandler,
    GetCurrentProductionWorksheetHandler,
    ListProductionContainersHandler,
    GetAtelierSheetSpecimenHandler,
    // La lecture de la fiche, partagée par la route datée et la route « en
    // cours » : un handler n'en appelle pas un autre (§4).
    ProductionWorksheetReading,
    WorksheetContents,
    WorksheetDeadlinesReading,
    // Le contenant est du paramétrage du fournil : lire et régler sont deux ports (ISP).
    { provide: ProductionContainerReader, useClass: PrismaProductionContainerReader },
    { provide: ProductionContainerRepository, useClass: PrismaProductionContainerRepository },
    // Régler l'affichage : les deux ports viennent de l'imprimerie.
    SetProductionDisplayHandler,
    // La remise au colisage d'une fournée déclarée ou annulée.
    PackingHandoffs,
  ],
})
export class ProductionAtelierModule {}

import { Module } from "@nestjs/common";

import { CloseProductionDayHandler } from "./application/commands/close-production-day.handler.js";
import { DeclarePackingContainersHandler } from "./application/commands/declare-packing-containers.handler.js";
import { MarkPackingLineHandler } from "./application/commands/mark-packing-line.handler.js";
import { StepPackingContainersHandler } from "./application/commands/step-packing-containers.handler.js";
import { MarkWorksheetLineHandler } from "./application/commands/mark-worksheet-line.handler.js";
import { PackOrderHandler } from "./application/commands/pack-order.handler.js";
import { RemoveProductionContainerHandler } from "./application/commands/remove-production-container.handler.js";
import { RetakeProductionDayHandler } from "./application/commands/retake-production-day.handler.js";
import { SetProductionContainerHandler } from "./application/commands/set-production-container.handler.js";
import { UnmarkPackingLineHandler } from "./application/commands/unmark-packing-line.handler.js";
import { UnmarkWorksheetLineHandler } from "./application/commands/unmark-worksheet-line.handler.js";
import { GetAtelierSheetPdfHandler } from "./application/queries/get-atelier-sheet-pdf.handler.js";
import { GetCurrentProductionWorksheetHandler } from "./application/queries/get-current-production-worksheet.handler.js";
import { GetProductionCountPdfHandler } from "./application/queries/get-production-count-pdf.handler.js";
import { GetProductionDayStatusHandler } from "./application/queries/get-production-day-status.handler.js";
import { GetProductionForecastHandler } from "./application/queries/get-production-forecast.handler.js";
import { GetProductionPackingHandler } from "./application/queries/get-production-packing.handler.js";
import { GetProductionWorksheetHandler } from "./application/queries/get-production-worksheet.handler.js";
import { ListProductionContainersHandler } from "./application/queries/list-production-containers.handler.js";
import { ProductionPapers } from "./application/services/production-paper.service.js";
import { ProductionWorksheetReading } from "./application/services/production-worksheet-reading.service.js";
import { ProductionContainerReader } from "./domain/ports/production-container.reader.js";
import { ProductionContainerRepository } from "./domain/ports/production-container.repository.js";
import { ProductionDayRepository } from "./domain/ports/production-day.repository.js";
import { ProductionPlanReader } from "./domain/ports/production-plan.reader.js";
import { ProductionDayController } from "./http/production-day.controller.js";
import { ProductionPackingController } from "./http/production-packing.controller.js";
import { ProductionSupervisionController } from "./http/production-supervision.controller.js";
import { ProductionWorksheetController } from "./http/production-worksheet.controller.js";
import {
  PrismaProductionContainerReader,
  PrismaProductionContainerRepository,
} from "./infrastructure/prisma-production-container.repository.js";
import { PrismaProductionDayRepository } from "./infrastructure/prisma-production-day.repository.js";
import { PrismaProductionPlanReader } from "./infrastructure/prisma-production-plan.reader.js";

/**
 * **Le fournil.**
 *
 * Il ne déclare PAS `DayOrdersReader` : c'est le port qu'il publie et que le
 * commerce implémente, relié dans la racine de composition
 * (`ProductionFeedModule`). Le brancher ici obligerait ce module à connaître
 * `b2b`, ce que la matrice des frontières interdit — et ce serait franchir la
 * frontière par la porte de service.
 *
 * ⚠️ **Le retrait n'est plus ici** depuis le 2026-09-10 : il a son bloc, son
 * module et son contrôleur. Ce que le fournil en garde est une QUESTION —
 * `AttestedHandoversReader`, qu'il déclare dans `channels/handover/` et que le
 * retrait implémente. Il ne tient plus son dépôt d'écriture.
 */
@Module({
  controllers: [
    ProductionDayController,
    ProductionWorksheetController,
    ProductionPackingController,
    ProductionSupervisionController,
  ],
  providers: [
    CloseProductionDayHandler,
    PackOrderHandler,
    MarkWorksheetLineHandler,
    UnmarkWorksheetLineHandler,
    MarkPackingLineHandler,
    UnmarkPackingLineHandler,
    DeclarePackingContainersHandler,
    StepPackingContainersHandler,
    RetakeProductionDayHandler,
    SetProductionContainerHandler,
    RemoveProductionContainerHandler,
    GetProductionDayStatusHandler,
    GetProductionForecastHandler,
    GetProductionWorksheetHandler,
    GetCurrentProductionWorksheetHandler,
    GetProductionPackingHandler,
    ListProductionContainersHandler,
    GetProductionCountPdfHandler,
    GetAtelierSheetPdfHandler,
    ProductionPapers,
    // La lecture de la fiche, partagée par la route datée et la route « en
    // cours » : un handler n'en appelle pas un autre (§4).
    ProductionWorksheetReading,
    { provide: ProductionDayRepository, useClass: PrismaProductionDayRepository },
    // La lecture du plan arrêté est un port À PART du dépôt d'écriture, et son
    // adaptateur vit chez la production : c'est SON schéma qu'il interroge.
    { provide: ProductionPlanReader, useClass: PrismaProductionPlanReader },
    // Le contenant est du PARAMÉTRAGE du fournil, et ses deux ports sont reliés
    // ici : c'est le schéma `production` qu'ils interrogent, donc rien n'a à
    // remonter dans la racine de composition. Deux adaptateurs pour deux ports —
    // lire et régler sont deux besoins (ISP), et TypeScript n'hérite pas de deux
    // classes abstraites.
    { provide: ProductionContainerReader, useClass: PrismaProductionContainerReader },
    { provide: ProductionContainerRepository, useClass: PrismaProductionContainerRepository },
  ],
})
export class ProductionModule {}

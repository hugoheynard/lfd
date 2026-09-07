import { Module } from "@nestjs/common";

import { CloseProductionDayHandler } from "./application/commands/close-production-day.handler.js";
import { GetProductionDayStatusHandler } from "./application/queries/get-production-day-status.handler.js";
import {
  GetAtelierSheetPdfHandler,
  GetProductionCountPdfHandler,
} from "./application/queries/get-production-paper.handler.js";
import { ProductionPapers } from "./application/services/production-paper.service.js";
import { ProductionDayRepository } from "./domain/ports/production-day.repository.js";
import { ProductionDayController } from "./http/production-day.controller.js";
import { PrismaProductionDayRepository } from "./infrastructure/prisma-production-day.repository.js";

/**
 * **Le fournil.**
 *
 * Il ne déclare PAS `DayOrdersReader` : c'est le port qu'il publie et que le
 * commerce implémente, relié dans la racine de composition
 * (`ProductionFeedModule`). Le brancher ici obligerait ce module à connaître
 * `b2b`, ce que la matrice des frontières interdit — et ce serait franchir la
 * frontière par la porte de service.
 */
@Module({
  controllers: [ProductionDayController],
  providers: [
    CloseProductionDayHandler,
    GetProductionDayStatusHandler,
    GetProductionCountPdfHandler,
    GetAtelierSheetPdfHandler,
    ProductionPapers,
    { provide: ProductionDayRepository, useClass: PrismaProductionDayRepository },
  ],
})
export class ProductionModule {}

import { Module } from "@nestjs/common";

import { CloseProductionDayHandler } from "./application/commands/close-production-day.handler.js";
import { PackOrderHandler } from "./application/commands/pack-order.handler.js";
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
 *
 * ⚠️ **La remise n'est plus ici** depuis le 2026-09-10 : elle a son bloc, son
 * module et son contrôleur. Ce que le fournil en garde est une QUESTION —
 * `AttestedHandoversReader`, qu'il déclare dans `channels/handover/` et que la
 * remise implémente. Il ne tient plus son dépôt d'écriture.
 */
@Module({
  controllers: [ProductionDayController],
  providers: [
    CloseProductionDayHandler,
    PackOrderHandler,
    GetProductionDayStatusHandler,
    GetProductionCountPdfHandler,
    GetAtelierSheetPdfHandler,
    ProductionPapers,
    { provide: ProductionDayRepository, useClass: PrismaProductionDayRepository },
  ],
})
export class ProductionModule {}

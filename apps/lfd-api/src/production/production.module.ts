import { Module } from "@nestjs/common";

import { CloseProductionDayHandler } from "./application/commands/close-production-day.handler.js";
import { ConfirmHandoverHandler } from "./application/commands/confirm-handover.handler.js";
import { ConfirmManualHandoverHandler } from "./application/commands/confirm-manual-handover.handler.js";
import { PackOrderHandler } from "./application/commands/pack-order.handler.js";
import { GetHandoverHandler } from "./application/queries/get-handover.handler.js";
import { GetProductionDayStatusHandler } from "./application/queries/get-production-day-status.handler.js";
import {
  GetAtelierSheetPdfHandler,
  GetProductionCountPdfHandler,
} from "./application/queries/get-production-paper.handler.js";
import { HandoverAttestation } from "./application/services/handover-attestation.service.js";
import { ProductionPapers } from "./application/services/production-paper.service.js";
import { OrderHandoverRepository } from "./domain/ports/order-handover.repository.js";
import { ProductionDayRepository } from "./domain/ports/production-day.repository.js";
import { ProductionHandoverController } from "./http/handover.controller.js";
import { ProductionDayController } from "./http/production-day.controller.js";
import { PrismaOrderHandoverRepository } from "./infrastructure/prisma-order-handover.repository.js";
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
 * Même chose pour `HandoverSubjectReader` : le fournil constate la remise, il ne
 * connaît pas la commande — il déclare ce dont il a besoin pour l'afficher.
 */
@Module({
  controllers: [ProductionDayController, ProductionHandoverController],
  providers: [
    CloseProductionDayHandler,
    PackOrderHandler,
    ConfirmHandoverHandler,
    ConfirmManualHandoverHandler,
    GetProductionDayStatusHandler,
    GetHandoverHandler,
    GetProductionCountPdfHandler,
    GetAtelierSheetPdfHandler,
    ProductionPapers,
    HandoverAttestation,
    { provide: ProductionDayRepository, useClass: PrismaProductionDayRepository },
    { provide: OrderHandoverRepository, useClass: PrismaOrderHandoverRepository },
  ],
})
export class ProductionModule {}

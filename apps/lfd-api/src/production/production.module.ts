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
import { CancelBatchHandler } from "./application/commands/cancel-batch.handler.js";
import { RecordBatchHandler } from "./application/commands/record-batch.handler.js";
import { DepositQualityPhotoHandler } from "./application/commands/deposit-quality-photo.handler.js";
import { RenderQualityCheckHandler } from "./application/commands/render-quality-check.handler.js";
import { PruneProductionDayChangesHandler } from "./application/commands/prune-production-day-changes.handler.js";
import { GetProductionDayVersionHandler } from "./application/queries/get-production-day-version.handler.js";
import { ProductionDayChangePruner } from "./domain/ports/production-day-change.pruner.js";
import { ProductionDayVersionReader } from "./domain/ports/production-day-version.reader.js";
import { ProductionDayVersionController } from "./http/production-day-version.controller.js";
import { PrismaProductionDayChangePruner } from "./infrastructure/prisma-production-day-change.pruner.js";
import { PrismaProductionDayVersionReader } from "./infrastructure/prisma-production-day-version.reader.js";
import { SweepQualityUploadsHandler } from "./application/commands/sweep-quality-uploads.handler.js";
import { GetQualityBoardHandler } from "./application/queries/get-quality-board.handler.js";
import { GetQualityPhotoHandler } from "./application/queries/get-quality-photo.handler.js";
import { ListQualityChecksHandler } from "./application/queries/list-quality-checks.handler.js";
import { QualityPhotoAttachment } from "./application/services/quality-photo-attachment.service.js";
import { QualityCheckReader } from "./domain/ports/quality-check.reader.js";
import { QualityCheckRepository } from "./domain/ports/quality-check.repository.js";
import { QualityUploadRepository } from "./domain/ports/quality-upload.repository.js";
import { ProductionQualityController } from "./http/production-quality.controller.js";
import { QualityUploadSweepController } from "./http/quality-upload-sweep.controller.js";
import {
  PrismaQualityCheckReader,
  PrismaQualityCheckRepository,
} from "./infrastructure/prisma-quality-check.repository.js";
import { PrismaQualityUploadRepository } from "./infrastructure/prisma-quality-upload.repository.js";
import { GetAtelierSheetPdfHandler } from "./application/queries/get-atelier-sheet-pdf.handler.js";
import { GetCurrentProductionWorksheetHandler } from "./application/queries/get-current-production-worksheet.handler.js";
import { GetProductionCountPdfHandler } from "./application/queries/get-production-count-pdf.handler.js";
import { GetProductionDayStatusHandler } from "./application/queries/get-production-day-status.handler.js";
import { GetProductionForecastHandler } from "./application/queries/get-production-forecast.handler.js";
import { GetProductionDueThresholdsHandler } from "./application/queries/get-production-due-thresholds.handler.js";
import { GetProductionPackingHandler } from "./application/queries/get-production-packing.handler.js";
import { GetProductionWorksheetHandler } from "./application/queries/get-production-worksheet.handler.js";
import { ListProductionContainersHandler } from "./application/queries/list-production-containers.handler.js";
import { ProductionPapers } from "./application/services/production-paper.service.js";
import { ProductionWorksheetReading } from "./application/services/production-worksheet-reading.service.js";
import { ProductionContainerReader } from "./domain/ports/production-container.reader.js";
import { ProductionContainerRepository } from "./domain/ports/production-container.repository.js";
import { ProductionDayRepository } from "./domain/ports/production-day.repository.js";
import { ProductionBatchRepository } from "./domain/ports/production-batch.repository.js";
import { ProductionDayLock } from "./domain/ports/production-day.lock.js";
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
import { PrismaProductionBatchRepository } from "./infrastructure/prisma-production-batch.repository.js";
import { PrismaProductionDayLock } from "./infrastructure/prisma-production-day.lock.js";
import { PrismaProductionPlanReader } from "./infrastructure/prisma-production-plan.reader.js";
import { DayLegacyPackingReader } from "./application/services/day-legacy-packing.reader.js";
import { PackingHandoffs } from "./application/services/packing-handoffs.service.js";
import { ProductionHandoffLedger } from "./domain/ports/production-handoff.ledger.js";
import { ProductionHandoffReader } from "./domain/ports/production-handoff.reader.js";
import { PrismaProductionHandoffLedger } from "./infrastructure/prisma-production-handoff.ledger.js";
import { PrismaProductionHandoffReader } from "./infrastructure/prisma-production-handoff.reader.js";
import { PackedDayReading } from "./application/services/packed-day-reading.service.js";
import { SealedDayReading } from "./application/services/sealed-day-reading.service.js";
import { ChannelQualityHeldOrdersReader } from "./application/services/channel-quality-held-orders.reader.js";
import { DayPlannedDestinationsReader } from "./application/services/day-planned-destinations.reader.js";
import { OnPackingReturned } from "./application/handlers/on-packing-returned.handler.js";
import { ProductionReturnRequests } from "./domain/ports/production-return.requests.js";
import { PrismaProductionReturnRequests } from "./infrastructure/prisma-production-return.requests.js";

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
    ProductionQualityController,
    QualityUploadSweepController,
    ProductionDayVersionController,
  ],
  providers: [
    CloseProductionDayHandler,
    PackOrderHandler,
    MarkWorksheetLineHandler,
    UnmarkWorksheetLineHandler,
    RecordBatchHandler,
    CancelBatchHandler,
    MarkPackingLineHandler,
    UnmarkPackingLineHandler,
    DeclarePackingContainersHandler,
    StepPackingContainersHandler,
    RetakeProductionDayHandler,
    SetProductionContainerHandler,
    RemoveProductionContainerHandler,
    GetProductionDayStatusHandler,
    GetProductionForecastHandler,
    GetProductionDueThresholdsHandler,
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
    { provide: ProductionBatchRepository, useClass: PrismaProductionBatchRepository },
    { provide: ProductionDayLock, useClass: PrismaProductionDayLock },
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
    // Le contrôle qualité du superviseur (plan `plan-controle-qualite.md`, QC2) :
    // son schéma est `production`, ses ports se relient donc ici. Lire une
    // journée et écrire un verdict sont deux ports (ISP), les dépôts un troisième.
    DepositQualityPhotoHandler,
    RenderQualityCheckHandler,
    SweepQualityUploadsHandler,
    GetQualityBoardHandler,
    ListQualityChecksHandler,
    GetQualityPhotoHandler,
    QualityPhotoAttachment,
    { provide: QualityCheckRepository, useClass: PrismaQualityCheckRepository },
    { provide: QualityCheckReader, useClass: PrismaQualityCheckReader },
    { provide: QualityUploadRepository, useClass: PrismaQualityUploadRepository },
    // La version par journée (`plan-version-par-journee.md`, V1-V2) : lire et
    // balayer le journal sont deux ports (ISP), sur le schéma `production`.
    GetProductionDayVersionHandler,
    PruneProductionDayChangesHandler,
    { provide: ProductionDayVersionReader, useClass: PrismaProductionDayVersionReader },
    { provide: ProductionDayChangePruner, useClass: PrismaProductionDayChangePruner },
    // La remise au colisage (plan `colisage/plan-domaine-colisage.md`, K1).
    PackingHandoffs,
    { provide: ProductionHandoffLedger, useClass: PrismaProductionHandoffLedger },
    { provide: ProductionHandoffReader, useClass: PrismaProductionHandoffReader },
    // La bascule (K2) : les retours demandés au colisage, et sa réponse.
    { provide: ProductionReturnRequests, useClass: PrismaProductionReturnRequests },
    OnPackingReturned,
    // La journée telle que le poste la voit, bacs compris (K2) — une lecture.
    PackedDayReading,
    // Les bacs fermés seulement — l'état du jour et le contrôle qualité (K3a).
    SealedDayReading,
    // Publiés pour le poste servi par le colisage (K3a) ; reliés par
    // `PackingFeedModule`.
    ChannelQualityHeldOrdersReader,
    DayPlannedDestinationsReader,
    // Publié pour la route de contrôle de l'ombre ; relié par `PackingFeedModule`.
    DayLegacyPackingReader,
  ],
  // La lecture des contrôles sert aussi la retenue que la production PUBLIE au
  // retrait (`channels/handover/`, QC3) — son adaptateur est relié par la
  // racine de composition, qui a besoin de ce port pour le construire.
  exports: [
    QualityCheckReader,
    DayLegacyPackingReader,
    ChannelQualityHeldOrdersReader,
    DayPlannedDestinationsReader,
  ],
})
export class ProductionModule {}

import { Module } from "@nestjs/common";

import { RunAutoCloseRoundHandler } from "./application/commands/run-auto-close-round.handler.js";
import { BusAutomaticDayCloser } from "./application/services/bus-automatic-day-closer.js";
import { PlanArrestBell } from "./application/services/plan-arrest-bell.js";
import { AutoCloseAttemptLog } from "./domain/ports/auto-close-attempt-log.js";
import { AutoCloseAttempts } from "./domain/ports/auto-close-attempts.js";
import { AutoCloseRoundReader } from "./domain/ports/auto-close-round.reader.js";
import { AutomaticDayCloser } from "./domain/ports/automatic-day-closer.js";
import { AutoCloseController } from "./http/auto-close.controller.js";
import {
  PrismaAutoCloseAttemptLog,
  PrismaAutoCloseAttempts,
  PrismaAutoCloseRoundReader,
} from "./infrastructure/prisma-auto-close-round.js";
import { AddProductionClosedDayHandler } from "./application/commands/add-production-closed-day.handler.js";
import { ChangeProductionCloseSettingsHandler } from "./application/commands/change-production-close-settings.handler.js";
import { RemoveProductionClosedDayHandler } from "./application/commands/remove-production-closed-day.handler.js";
import { GetProductionSettingsHandler } from "./application/queries/get-production-settings.handler.js";
import { ProductionCloseSettingsRepository } from "./domain/ports/production-close-settings.repository.js";
import { ProductionClosedDayRepository } from "./domain/ports/production-closed-day.repository.js";
import { ProductionSettingsReader } from "./domain/ports/production-settings.reader.js";
import { ProductionSettingsController } from "./http/production-settings.controller.js";
import { PrismaProductionCloseSettingsRepository } from "./infrastructure/prisma-production-close-settings.repository.js";
import { PrismaProductionClosedDayRepository } from "./infrastructure/prisma-production-closed-day.repository.js";
import { PrismaProductionSettingsReader } from "./infrastructure/prisma-production-settings.reader.js";
import { AddExternalDossierRecipientHandler } from "./application/commands/add-external-dossier-recipient.handler.js";
import { AddStaffDossierRecipientHandler } from "./application/commands/add-staff-dossier-recipient.handler.js";
import { RemoveDossierRecipientHandler } from "./application/commands/remove-dossier-recipient.handler.js";
import { ListDossierRecipientsHandler } from "./application/queries/list-dossier-recipients.handler.js";
import { ListDossierStaffCandidatesHandler } from "./application/queries/list-dossier-staff-candidates.handler.js";
import { DossierRecipientsReader } from "./domain/ports/dossier-recipients.reader.js";
import { DossierRecipientsRepository } from "./domain/ports/dossier-recipients.repository.js";
import { ProductionDossierRecipientsController } from "./http/production-dossier-recipients.controller.js";
import {
  PrismaDossierRecipientsReader,
  PrismaDossierRecipientsRepository,
} from "./infrastructure/prisma-dossier-recipients.repository.js";
import { CloseProductionDayHandler } from "./application/commands/close-production-day.handler.js";
import { MarkWorksheetLineHandler } from "./application/commands/mark-worksheet-line.handler.js";
import { RemoveProductionContainerHandler } from "./application/commands/remove-production-container.handler.js";
import { RetakeProductionDayHandler } from "./application/commands/retake-production-day.handler.js";
import { SetProductionContainerHandler } from "./application/commands/set-production-container.handler.js";
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
import { GetDayDossierPdfHandler } from "./application/queries/get-day-dossier-pdf.handler.js";
import { GetProductionCountPdfHandler } from "./application/queries/get-production-count-pdf.handler.js";
import { GetProductionDayStatusHandler } from "./application/queries/get-production-day-status.handler.js";
import { GetProductionForecastHandler } from "./application/queries/get-production-forecast.handler.js";
import { GetProductionDueThresholdsHandler } from "./application/queries/get-production-due-thresholds.handler.js";
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
import { PackingHandoffs } from "./application/services/packing-handoffs.service.js";
import { ProductionHandoffLedger } from "./domain/ports/production-handoff.ledger.js";
import { ProductionHandoffReader } from "./domain/ports/production-handoff.reader.js";
import { PrismaProductionHandoffLedger } from "./infrastructure/prisma-production-handoff.ledger.js";
import { PrismaProductionHandoffReader } from "./infrastructure/prisma-production-handoff.reader.js";
import { SealedDayReading } from "./application/services/sealed-day-reading.service.js";
import { ChannelQualityHeldOrdersReader } from "./application/services/channel-quality-held-orders.reader.js";
import { DayPlannedDestinationsReader } from "./application/services/day-planned-destinations.reader.js";
import { OnPackingReturned } from "./application/handlers/on-packing-returned.handler.js";
import { SendDossierOnDayClosed } from "./application/handlers/send-dossier-on-day-closed.handler.js";
import { SendDossierOnDayRetaken } from "./application/handlers/send-dossier-on-day-retaken.handler.js";
import { DossierDispatch } from "./application/services/dossier-dispatch.service.js";
import { DossierDispatchLog } from "./domain/ports/dossier-dispatch.log.js";
import { PrismaDossierDispatchLog } from "./infrastructure/prisma-dossier-dispatch.log.js";
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
    ProductionSupervisionController,
    ProductionQualityController,
    QualityUploadSweepController,
    ProductionDayVersionController,
    ProductionSettingsController,
    ProductionDossierRecipientsController,
    AutoCloseController,
  ],
  providers: [
    CloseProductionDayHandler,
    // Le tour de l'arrêt automatique (plan `arret-du-plan.md`, lot A2) :
    // la vraie clôture par le bus, sous l'acteur système, et la cloche du staff.
    RunAutoCloseRoundHandler,
    PlanArrestBell,
    { provide: AutomaticDayCloser, useClass: BusAutomaticDayCloser },
    { provide: AutoCloseRoundReader, useClass: PrismaAutoCloseRoundReader },
    { provide: AutoCloseAttempts, useClass: PrismaAutoCloseAttempts },
    { provide: AutoCloseAttemptLog, useClass: PrismaAutoCloseAttemptLog },
    MarkWorksheetLineHandler,
    UnmarkWorksheetLineHandler,
    RecordBatchHandler,
    CancelBatchHandler,
    RetakeProductionDayHandler,
    SetProductionContainerHandler,
    RemoveProductionContainerHandler,
    GetProductionDayStatusHandler,
    GetProductionForecastHandler,
    GetProductionDueThresholdsHandler,
    GetProductionWorksheetHandler,
    GetCurrentProductionWorksheetHandler,
    ListProductionContainersHandler,
    GetProductionCountPdfHandler,
    GetDayDossierPdfHandler,
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
    // La remise au colisage (plan `colisage/colisage.md`, K1).
    PackingHandoffs,
    { provide: ProductionHandoffLedger, useClass: PrismaProductionHandoffLedger },
    { provide: ProductionHandoffReader, useClass: PrismaProductionHandoffReader },
    // La bascule (K2) : les retours demandés au colisage, et sa réponse.
    { provide: ProductionReturnRequests, useClass: PrismaProductionReturnRequests },
    OnPackingReturned,
    // Les bacs fermés seulement — l'état du jour et le contrôle qualité (K3a).
    SealedDayReading,
    // Publiés pour le poste servi par le colisage (K3a) ; reliés par
    // `PackingFeedModule`.
    ChannelQualityHeldOrdersReader,
    DayPlannedDestinationsReader,
    // Les réglages du fournil — l'arrêt du plan et les jours fermés (A1) :
    // schéma `production`, deux dépôts et un lecteur (ISP). L'heure limite
    // vient du commerce par `OrderCutoffRulesReader`, relié par
    // `ProductionFeedModule`.
    ChangeProductionCloseSettingsHandler,
    AddProductionClosedDayHandler,
    RemoveProductionClosedDayHandler,
    GetProductionSettingsHandler,
    {
      provide: ProductionCloseSettingsRepository,
      useClass: PrismaProductionCloseSettingsRepository,
    },
    { provide: ProductionClosedDayRepository, useClass: PrismaProductionClosedDayRepository },
    { provide: ProductionSettingsReader, useClass: PrismaProductionSettingsReader },
    // Les destinataires du dossier du jour (`plan-envoi-du-dossier.md`, E2) :
    // schéma `production` ; les fiches du personnel se relisent par les ports
    // de lecture de l'annuaire (`StaffContacts`, `ReachableStaff`), globaux.
    AddStaffDossierRecipientHandler,
    AddExternalDossierRecipientHandler,
    RemoveDossierRecipientHandler,
    ListDossierRecipientsHandler,
    ListDossierStaffCandidatesHandler,
    { provide: DossierRecipientsRepository, useClass: PrismaDossierRecipientsRepository },
    { provide: DossierRecipientsReader, useClass: PrismaDossierRecipientsReader },
    // L'envoi du dossier (E3) : deux abonnés durables du fournil, un service
    // partagé, et sa trace d'envoi dans le schéma `production`.
    SendDossierOnDayClosed,
    SendDossierOnDayRetaken,
    DossierDispatch,
    { provide: DossierDispatchLog, useClass: PrismaDossierDispatchLog },
  ],
  // La lecture des contrôles sert aussi la retenue que la production PUBLIE au
  // retrait (`channels/handover/`, QC3) — son adaptateur est relié par la
  // racine de composition, qui a besoin de ce port pour le construire.
  exports: [QualityCheckReader, ChannelQualityHeldOrdersReader, DayPlannedDestinationsReader],
})
export class ProductionModule {}

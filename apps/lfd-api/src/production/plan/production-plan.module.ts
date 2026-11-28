import { Module } from "@nestjs/common";

import { BrandModule } from "../../platform/brand/brand.module.js";
import { ProductionDayModule } from "../day/production-day.module.js";
import { ProductionPrintModule } from "../shared/print/production-print.module.js";
import { ProductionWorkstationsModule } from "../workstations/production-workstations.module.js";
import { AddExternalDossierRecipientHandler } from "./application/commands/add-external-dossier-recipient.handler.js";
import { AddProductionClosedDayHandler } from "./application/commands/add-production-closed-day.handler.js";
import { AddStaffDossierRecipientHandler } from "./application/commands/add-staff-dossier-recipient.handler.js";
import { CloseProductionDayHandler } from "./application/commands/close-production-day.handler.js";
import { RemoveDossierRecipientHandler } from "./application/commands/remove-dossier-recipient.handler.js";
import { RemoveProductionClosedDayHandler } from "./application/commands/remove-production-closed-day.handler.js";
import { ReopenProductionDayHandler } from "./application/commands/reopen-production-day.handler.js";
import { RetakeProductionDayHandler } from "./application/commands/retake-production-day.handler.js";
import { RunAutoCloseRoundHandler } from "./application/commands/run-auto-close-round.handler.js";
import { SetProductionTranchesHandler } from "./application/commands/set-production-tranches.handler.js";
import { DrawProvisionalPrintHandler } from "./application/commands/draw-provisional-print.handler.js";
import { PruneProvisionalPrintsHandler } from "./application/commands/prune-provisional-prints.handler.js";
import { GetPrintOptionsHandler } from "./application/queries/get-print-options.handler.js";
import { GetProvisionalDossierSpecimenHandler } from "./application/queries/get-provisional-dossier-specimen.handler.js";
import { GetProvisionalPrintPdfHandler } from "./application/queries/get-provisional-print-pdf.handler.js";
import { DossierGroupLabelsReading } from "./application/services/dossier-group-labels.js";
import { LiveDossierContent } from "./application/services/live-dossier-content.js";
import { ProvisionalPrintIntake } from "./application/services/provisional-print-intake.js";
import { ProvisionalPrintLedger } from "./domain/ports/provisional-print.ledger.js";
import { ProvisionalPrintPruner } from "./domain/ports/provisional-print.pruner.js";
import { ProvisionalPrintsReader } from "./domain/ports/provisional-prints.reader.js";
import { ProvisionalPrintController } from "./http/provisional-print.controller.js";
import { ProvisionalPrintSweepController } from "./http/provisional-print-sweep.controller.js";
import {
  PrismaProvisionalPrintLedger,
  PrismaProvisionalPrintPruner,
  PrismaProvisionalPrintsReader,
} from "./infrastructure/prisma-provisional-prints.js";
import { SendDossierOnDayClosed } from "./application/handlers/send-dossier-on-day-closed.handler.js";
import { SendDossierOnDayRetaken } from "./application/handlers/send-dossier-on-day-retaken.handler.js";
import { GetDayDossierPdfHandler } from "./application/queries/get-day-dossier-pdf.handler.js";
import { GetDayDossierSpecimenHandler } from "./application/queries/get-day-dossier-specimen.handler.js";
import { GetProductionSimulationPdfHandler } from "./application/queries/get-production-simulation-pdf.handler.js";
import { GetProductionSimulationSpecimenHandler } from "./application/queries/get-production-simulation-specimen.handler.js";
import { GetProductionCountPdfHandler } from "./application/queries/get-production-count-pdf.handler.js";
import { GetProductionCountSpecimenHandler } from "./application/queries/get-production-count-specimen.handler.js";
import { GetProductionDayStatusHandler } from "./application/queries/get-production-day-status.handler.js";
import { GetProductionForecastHandler } from "./application/queries/get-production-forecast.handler.js";
import { GetProductionSettingsHandler } from "./application/queries/get-production-settings.handler.js";
import { ListDossierRecipientsHandler } from "./application/queries/list-dossier-recipients.handler.js";
import { ListDossierStaffCandidatesHandler } from "./application/queries/list-dossier-staff-candidates.handler.js";
import { BusAutomaticDayCloser } from "./application/services/bus-automatic-day-closer.js";
import { DossierDispatch } from "./application/services/dossier-dispatch.service.js";
import { ArchivedPlanVersionPaper } from "./application/services/archived-plan-version-paper.js";
import { DossierDeadlinesReading } from "./application/services/dossier-deadlines-reading.service.js";
import { DossierFunctionSheetsReading } from "./application/services/dossier-function-sheets-reading.service.js";
import { PlanArrestAdmission } from "./application/services/plan-arrest-admission.js";
import { PlanArrestBell } from "./application/services/plan-arrest-bell.js";
import { PlanArrestRecording } from "./application/services/plan-arrest-recording.js";
import { PlanIntakeReading } from "./application/services/plan-intake-reading.js";
import { PlanStopRules } from "./application/services/plan-stop-rules.js";
import { ProductionPlanAdmissionDesk } from "./application/services/production-plan-admission.desk.js";
import { ProductionPaperRenderer } from "./application/services/production-paper.service.js";
import { ArrestedProductionPlanReader } from "./application/services/arrested-production-plan.reader.js";
import { RetakeRecording } from "./application/services/retake-recording.js";
import { AutoCloseAttemptLog } from "./domain/ports/auto-close-attempt-log.js";
import { AutoCloseAttempts } from "./domain/ports/auto-close-attempts.js";
import { AutoCloseRoundReader } from "./domain/ports/auto-close-round.reader.js";
import { AutomaticDayCloser } from "./domain/ports/automatic-day-closer.js";
import { DossierDispatchLog } from "./domain/ports/dossier-dispatch.log.js";
import { DossierRecipientsReader } from "./domain/ports/dossier-recipients.reader.js";
import { DossierRecipientsRepository } from "./domain/ports/dossier-recipients.repository.js";
import { ProductionClosedDayRepository } from "./domain/ports/production-closed-day.repository.js";
import { ProductionPlanReader } from "./domain/ports/production-plan.reader.js";
import { ProductionSettingsReader } from "./domain/ports/production-settings.reader.js";
import { AdminDayPapersSpecimensController } from "./http/admin-day-papers-specimens.controller.js";
import { AutoCloseController } from "./http/auto-close.controller.js";
import { ProductionDayRetakeController } from "./http/production-day-retake.controller.js";
import { ProductionDayController } from "./http/production-day.controller.js";
import { ProductionPlanVersionsController } from "./http/production-plan-versions.controller.js";
import { ComparePlanVersionsHandler } from "./application/queries/compare-plan-versions.handler.js";
import { ListDossierDispatchesHandler } from "./application/queries/list-dossier-dispatches.handler.js";
import { ListPlanVersionsHandler } from "./application/queries/list-plan-versions.handler.js";
import { PlanVersionPaperShelf } from "./application/services/plan-version-paper-shelf.js";
import { DossierDispatchesReader } from "./domain/ports/dossier-dispatches.reader.js";
import { PrismaDossierDispatchesReader } from "./infrastructure/prisma-dossier-dispatches.reader.js";
import { ProductionDossierRecipientsController } from "./http/production-dossier-recipients.controller.js";
import { ProductionSettingsController } from "./http/production-settings.controller.js";
import { ProductionSimulationController } from "./http/production-simulation.controller.js";
import {
  PrismaAutoCloseAttemptLog,
  PrismaAutoCloseAttempts,
  PrismaAutoCloseRoundReader,
} from "./infrastructure/prisma-auto-close-round.js";
import { PrismaDossierDispatchLog } from "./infrastructure/prisma-dossier-dispatch.log.js";
import {
  PrismaDossierRecipientsReader,
  PrismaDossierRecipientsRepository,
} from "./infrastructure/prisma-dossier-recipients.repository.js";
import { PrismaProductionClosedDayRepository } from "./infrastructure/prisma-production-closed-day.repository.js";
import { PrismaProductionSettingsReader } from "./infrastructure/prisma-production-settings.reader.js";

/**
 * **Le plan du jour** : arrêter, rouvrir, retirer, clôturer, l'arrêt
 * automatique, le prévisionnel, les jours fermés et les destinataires du
 * dossier.
 *
 * Il importe la journée et l'imprimerie (`shared/print/`). Ses exports servent
 * deux lecteurs : la racine de composition (le guichet d'admission) et la fiche PDF de l'atelier, que la
 * racine du fournil garde parce qu'elle lit le rendu des papiers (voir
 * `ProductionModule`).
 */
@Module({
  imports: [
    ProductionDayModule,
    // L'archive des papiers et les réglages d'affichage.
    ProductionPrintModule,
    // Les postes : le rangement par poste (mode prod) et sa garde de bascule.
    ProductionWorkstationsModule,
    // Le logo des exemplaires du dossier et du compte.
    BrandModule,
  ],
  controllers: [
    ProductionDayController,
    ProductionPlanVersionsController,
    ProductionDayRetakeController,
    ProductionSettingsController,
    AdminDayPapersSpecimensController,
    ProductionDossierRecipientsController,
    AutoCloseController,
    // La simulation du catalogue, sous la page Postes : elle rend une partie du dossier.
    ProductionSimulationController,
    // La fenêtre d'impression : son état, l'impression provisoire, son PDF ;
    // et le balayage nocturne des impressions des journées passées.
    ProvisionalPrintController,
    ProvisionalPrintSweepController,
  ],
  providers: [
    CloseProductionDayHandler,
    RetakeProductionDayHandler,
    ReopenProductionDayHandler,
    GetProductionDayStatusHandler,
    // Le tour de l'arrêt automatique : la vraie clôture par le bus, sous
    // l'acteur système, et la cloche du staff.
    RunAutoCloseRoundHandler,
    PlanArrestBell,
    { provide: AutomaticDayCloser, useClass: BusAutomaticDayCloser },
    { provide: AutoCloseRoundReader, useClass: PrismaAutoCloseRoundReader },
    { provide: AutoCloseAttempts, useClass: PrismaAutoCloseAttempts },
    { provide: AutoCloseAttemptLog, useClass: PrismaAutoCloseAttemptLog },
    // L'arrêt et le retirage : ce qu'ils lisent sous le verrou, ce qu'ils écrivent et publient.
    PlanIntakeReading,
    PlanArrestAdmission,
    PlanArrestRecording,
    RetakeRecording,
    // L'arrêt suit la plus tardive de l'heure limite générale et de l'heure du réassort.
    PlanStopRules,
    // La lecture du plan arrêté est un port à part du dépôt d'écriture.
    { provide: ProductionPlanReader, useClass: ArrestedProductionPlanReader },
    SetProductionTranchesHandler,
    GetDayDossierSpecimenHandler,
    GetProductionSimulationPdfHandler,
    GetProductionSimulationSpecimenHandler,
    GetProductionCountSpecimenHandler,
    DossierDeadlinesReading,
    DossierFunctionSheetsReading,
    // Ce que le dossier lit pour se ranger : rayons, ou articles et postes.
    // Les papiers du plan : le rendu, le dossier et le compte.
    ProductionPaperRenderer,
    GetProductionCountPdfHandler,
    GetDayDossierPdfHandler,
    // Le papier d'une version, rangé après la validation du geste qui l'écrit ;
    // relié au port du noyau par `PlanVersionPaperFeedModule`.
    ArchivedPlanVersionPaper,
    // L'envoi du dossier : deux abonnés durables et le service qu'ils partagent.
    DossierDispatch,
    SendDossierOnDayClosed,
    SendDossierOnDayRetaken,
    GetProductionForecastHandler,
    GetProductionSettingsHandler,
    // Les jours fermés : un dépôt et un lecteur (ISP).
    AddProductionClosedDayHandler,
    RemoveProductionClosedDayHandler,
    { provide: ProductionClosedDayRepository, useClass: PrismaProductionClosedDayRepository },
    { provide: ProductionSettingsReader, useClass: PrismaProductionSettingsReader },
    // Les destinataires du dossier du jour ; les fiches du personnel se
    // relisent par les ports de lecture de l'annuaire, globaux.
    AddStaffDossierRecipientHandler,
    AddExternalDossierRecipientHandler,
    RemoveDossierRecipientHandler,
    ListDossierRecipientsHandler,
    ListDossierStaffCandidatesHandler,
    { provide: DossierRecipientsRepository, useClass: PrismaDossierRecipientsRepository },
    { provide: DossierRecipientsReader, useClass: PrismaDossierRecipientsReader },
    { provide: DossierDispatchLog, useClass: PrismaDossierDispatchLog },
    // Les versions du plan (lot H4) : la liste, la comparaison, et ce que
    // chaque destinataire a reçu — des lectures, la trace se lit par son port.
    ListPlanVersionsHandler,
    ComparePlanVersionsHandler,
    ListDossierDispatchesHandler,
    PlanVersionPaperShelf,
    { provide: DossierDispatchesReader, useClass: PrismaDossierDispatchesReader },
    ProductionPlanAdmissionDesk,
    // L'impression provisoire du dossier, avant l'arrêt : écrire, lire et
    // balayer sont trois ports (ISP).
    LiveDossierContent,
    DossierGroupLabelsReading,
    ProvisionalPrintIntake,
    DrawProvisionalPrintHandler,
    GetPrintOptionsHandler,
    GetProvisionalPrintPdfHandler,
    GetProvisionalDossierSpecimenHandler,
    PruneProvisionalPrintsHandler,
    { provide: ProvisionalPrintLedger, useClass: PrismaProvisionalPrintLedger },
    { provide: ProvisionalPrintsReader, useClass: PrismaProvisionalPrintsReader },
    { provide: ProvisionalPrintPruner, useClass: PrismaProvisionalPrintPruner },
  ],
  exports: [
    // Ce que la racine de composition relie aux autres blocs.
    ProductionPlanAdmissionDesk,
    // Et au noyau, qui ne peut pas importer le plan.
    ArchivedPlanVersionPaper,
  ],
})
export class ProductionPlanModule {}

/**
 * Les fournisseurs que ce module exporte et que la racine de composition
 * (`appBootstrap/`) relie à un port d'un autre bloc : elle les prend ici,
 * jamais dans l'intérieur du métier.
 */
export { ArchivedPlanVersionPaper, ProductionPlanAdmissionDesk };

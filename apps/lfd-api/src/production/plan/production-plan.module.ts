import { Module } from "@nestjs/common";

import { BrandModule } from "../../platform/brand/brand.module.js";
import { ClosedPlansReader } from "../channels/commerce/closed-plans.reader.js";
import { ArrestedPlanHold } from "../channels/packing/arrested-plan.hold.js";
import { ProductionDayModule } from "../day/production-day.module.js";
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
import { GetDayDossierSpecimenHandler } from "./application/queries/get-day-dossier-specimen.handler.js";
import { GetProductionCountSpecimenHandler } from "./application/queries/get-production-count-specimen.handler.js";
import { GetProductionDayStatusHandler } from "./application/queries/get-production-day-status.handler.js";
import { ListDossierRecipientsHandler } from "./application/queries/list-dossier-recipients.handler.js";
import { ListDossierStaffCandidatesHandler } from "./application/queries/list-dossier-staff-candidates.handler.js";
import { BusAutomaticDayCloser } from "./application/services/bus-automatic-day-closer.js";
import { DossierDeadlinesReading } from "./application/services/dossier-deadlines-reading.service.js";
import { PlanArrestAdmission } from "./application/services/plan-arrest-admission.js";
import { PlanArrestBell } from "./application/services/plan-arrest-bell.js";
import { PlanArrestRecording } from "./application/services/plan-arrest-recording.js";
import { PlanIntakeReading } from "./application/services/plan-intake-reading.js";
import { PlanStopRules } from "./application/services/plan-stop-rules.js";
import { ProductionPlanAdmissionDesk } from "./application/services/production-plan-admission.desk.js";
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
import { ProductionDossierRecipientsController } from "./http/production-dossier-recipients.controller.js";
import { ProductionSettingsController } from "./http/production-settings.controller.js";
import { PrismaArrestedPlanHold } from "./infrastructure/prisma-arrested-plan.hold.js";
import {
  PrismaAutoCloseAttemptLog,
  PrismaAutoCloseAttempts,
  PrismaAutoCloseRoundReader,
} from "./infrastructure/prisma-auto-close-round.js";
import { PrismaClosedPlansReader } from "./infrastructure/prisma-closed-plans.reader.js";
import { PrismaDossierDispatchLog } from "./infrastructure/prisma-dossier-dispatch.log.js";
import {
  PrismaDossierRecipientsReader,
  PrismaDossierRecipientsRepository,
} from "./infrastructure/prisma-dossier-recipients.repository.js";
import { PrismaProductionClosedDayRepository } from "./infrastructure/prisma-production-closed-day.repository.js";
import { PrismaProductionPlanReader } from "./infrastructure/prisma-production-plan.reader.js";
import { PrismaProductionSettingsReader } from "./infrastructure/prisma-production-settings.reader.js";

/**
 * **Le plan du jour** : arrêter, rouvrir, retirer, clôturer, l'arrêt
 * automatique, le prévisionnel, les jours fermés et les destinataires du
 * dossier.
 *
 * Il n'importe que la journée. Ses exports servent deux lecteurs : la racine
 * de composition (le plan arrêté tenu, la limite des commandes, le guichet
 * d'admission) et les papiers que la racine du fournil garde tant que le plan
 * et l'atelier se lisent l'un l'autre (voir `ProductionModule`).
 */
@Module({
  imports: [
    ProductionDayModule,
    // Le logo des exemplaires du dossier et du compte.
    BrandModule,
  ],
  controllers: [
    ProductionDayController,
    ProductionDayRetakeController,
    ProductionSettingsController,
    AdminDayPapersSpecimensController,
    ProductionDossierRecipientsController,
    AutoCloseController,
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
    // Tenir le plan arrêté pendant un geste du colisage ou de la livraison :
    // publié par `channels/packing/`.
    { provide: ArrestedPlanHold, useClass: PrismaArrestedPlanHold },
    // La lecture du plan arrêté est un port à part du dépôt d'écriture.
    { provide: ProductionPlanReader, useClass: PrismaProductionPlanReader },
    SetProductionTranchesHandler,
    GetDayDossierSpecimenHandler,
    GetProductionCountSpecimenHandler,
    DossierDeadlinesReading,
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
    // L'arrêt du plan comme limite : relié par `ProductionDeskFeedModule`.
    PrismaClosedPlansReader,
    { provide: ClosedPlansReader, useExisting: PrismaClosedPlansReader },
    ProductionPlanAdmissionDesk,
  ],
  exports: [
    // Ce que la racine de composition relie aux autres blocs.
    ArrestedPlanHold,
    PrismaClosedPlansReader,
    ProductionPlanAdmissionDesk,
    // Ce que les papiers gardés par `ProductionModule` injectent.
    DossierDeadlinesReading,
    DossierRecipientsReader,
    DossierDispatchLog,
    PlanArrestBell,
    PlanStopRules,
    ProductionPlanReader,
    ProductionSettingsReader,
    AutoCloseAttemptLog,
  ],
})
export class ProductionPlanModule {}

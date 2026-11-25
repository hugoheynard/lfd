import { Module } from "@nestjs/common";

import { BrandModule } from "../../platform/brand/brand.module.js";
import { DayVersionsModule } from "../../platform/day-versions/day-versions.module.js";
import { ProductionDayModule } from "../day/production-day.module.js";
import { ProductionQualityModule } from "../quality/production-quality.module.js";
import { ProductionPrintModule } from "../shared/print/production-print.module.js";
import { ProductionWorkstationsModule } from "../workstations/production-workstations.module.js";
import { CancelBatchHandler } from "./application/commands/cancel-batch.handler.js";
import { RunAlwaysGreenLineHandler } from "./application/commands/run-always-green-line.handler.js";
import { RunAlwaysGreenRoundHandler } from "./application/commands/run-always-green-round.handler.js";
import { UnconfirmedLinesReading } from "./application/services/unconfirmed-lines-reading.service.js";
import { BusAlwaysGreenLineRunner } from "./application/services/bus-always-green-line-runner.js";
import { AlwaysGreenLineRunner } from "./domain/ports/always-green-line-runner.js";
import { AlwaysGreenLines } from "./application/services/always-green-lines.service.js";
import { AlwaysGreenController } from "./http/always-green.controller.js";
import { MarkLineDoneHandler } from "./application/commands/mark-line-done.handler.js";
import { ReportProblemHandler } from "./application/commands/report-problem.handler.js";
import { ResolveProblemHandler } from "./application/commands/resolve-problem.handler.js";
import { ListOpenProductionProblemsHandler } from "./application/queries/list-open-production-problems.handler.js";
import { BatchRecording } from "./application/services/batch-recording.service.js";
import { OutputCorrecting } from "./application/services/output-correcting.service.js";
import { ProblemBell } from "./application/services/problem-bell.js";
import {
  DayProblemsReader,
  OpenProductionProblemsReader,
  ProductionProblemRepository,
} from "./domain/ports/production-problem.ports.js";
import {
  PrismaDayProblemsReader,
  PrismaOpenProductionProblemsReader,
  PrismaProductionProblemRepository,
} from "./infrastructure/prisma-production-problem.repository.js";
import { RecordBatchHandler } from "./application/commands/record-batch.handler.js";
import { RemoveProductionContainerHandler } from "./application/commands/remove-production-container.handler.js";
import { SetProductionContainerHandler } from "./application/commands/set-production-container.handler.js";
import { SetProductionDisplayHandler } from "./application/commands/set-production-display.handler.js";
import { SetProductionTrackingHandler } from "./application/commands/set-production-tracking.handler.js";
import { GetProductionTrackingHandler } from "./application/queries/get-production-tracking.handler.js";
import { DayTrackingLevelsFreezing } from "./application/services/day-tracking-levels-freezing.service.js";
import { DayTrackingLevelsReading } from "./application/services/day-tracking-levels-reading.service.js";
import { WorksheetTrackingLevelsReading } from "./application/services/worksheet-tracking-levels.js";
import {
  DayTrackingLevelsFreezer,
  FrozenTrackingLevelsReader,
} from "./domain/ports/day-tracking-levels.ports.js";
import {
  ProductionTrackingSettingsReader,
  ProductionTrackingSettingsRepository,
  ProductionTrackingSettingsVersion,
} from "./domain/ports/production-tracking-settings.ports.js";
import { TrackingLevelsCommissioning } from "./domain/ports/tracking-levels-commissioning.js";
import { ProductionTrackingSettingsController } from "./http/production-tracking-settings.controller.js";
import { ConstantTrackingLevelsCommissioning } from "./infrastructure/constant-tracking-levels-commissioning.js";
import {
  PrismaDayTrackingLevelsFreezer,
  PrismaFrozenTrackingLevelsReader,
} from "./infrastructure/prisma-day-tracking-levels.js";
import {
  PrismaProductionTrackingSettingsReader,
  PrismaProductionTrackingSettingsRepository,
  PrismaProductionTrackingSettingsVersion,
} from "./infrastructure/prisma-production-tracking-settings.js";
import { GetAtelierSheetPdfHandler } from "./application/queries/get-atelier-sheet-pdf.handler.js";
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
import { ProductionLineStepsController } from "./http/production-line-steps.controller.js";
import { MarkStepDoneHandler } from "./application/commands/mark-step-done.handler.js";
import { MarkStepRedHandler } from "./application/commands/mark-step-red.handler.js";
import { UndoStepHandler } from "./application/commands/undo-step.handler.js";
import { AlwaysGreenStepsRound } from "./application/services/always-green-steps.service.js";
import { LineStepGestures } from "./application/services/line-step-gestures.service.js";
import { StepRedsReading } from "./application/services/step-reds-reading.service.js";
import {
  AutomaticStepChecks,
  DayLineStepsReader,
  LineStepRepository,
} from "./domain/ports/line-step.ports.js";
import {
  PrismaAutomaticStepChecks,
  PrismaDayLineStepsReader,
  PrismaLineStepRepository,
} from "./infrastructure/prisma-line-step.repository.js";
import {
  PrismaProductionContainerReader,
  PrismaProductionContainerRepository,
} from "./infrastructure/prisma-production-container.repository.js";
import { ProductionBatchShortcutsModule } from "./production-batch-shortcuts.module.js";

/**
 * **L'atelier** : les fournées, la fiche d'atelier, les contenants, l'affichage
 * et les raccourcis (`documentation/fournil/la-fiche-d-atelier.md`).
 *
 * Il lit la journée, les pastilles de la qualité, l'imprimerie
 * (`shared/print/`) et les postes (`workstations/`), les seuls modules du
 * fournil qu'il a le droit d'importer. Il n'exporte rien.
 */
@Module({
  imports: [
    ProductionDayModule,
    ProductionQualityModule,
    // L'imprimerie : les réglages d'affichage, lus par la fiche et réglés
    // ici ; la fiche PDF d'une commande.
    ProductionPrintModule,
    // Les postes : le rangement par poste (mode prod) et sa garde de bascule.
    ProductionWorkstationsModule,
    // Les articles des raccourcis viennent du canal `channels/commerce/`, global.
    ProductionBatchShortcutsModule,
    // Le logo de l'exemplaire de la fiche ; les contenus versionnés de la fiche.
    BrandModule,
    DayVersionsModule,
  ],
  controllers: [
    ProductionAtelierSheetController,
    ProductionWorksheetController,
    // Les étapes d'une ligne : un poste qui ne la finit pas coche sa part.
    ProductionLineStepsController,
    ProductionSupervisionController,
    ProductionDisplaySettingsController,
    ProductionTrackingSettingsController,
    // La fournée automatique : la route du cron, sous RecomputeGuard.
    AlwaysGreenController,
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
    // La fiche d'une commande, imprimée par l'imprimerie et archivée.
    GetAtelierSheetPdfHandler,
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
    // Les niveaux de suivi (`fournil/les-niveaux-de-suivi.md`) : le réglage du
    // fournil — lire, écrire et son numéro sont trois ports (ISP) —, le
    // niveau figé d'une journée — lire et figer sont deux ports —, et la mise
    // en service.
    SetProductionTrackingHandler,
    // La fournée automatique (toujours vert) : le tour, et une commande par ligne.
    RunAlwaysGreenRoundHandler,
    RunAlwaysGreenLineHandler,
    AlwaysGreenLines,
    UnconfirmedLinesReading,
    { provide: AlwaysGreenLineRunner, useClass: BusAlwaysGreenLineRunner },
    GetProductionTrackingHandler,
    DayTrackingLevelsReading,
    DayTrackingLevelsFreezing,
    WorksheetTrackingLevelsReading,
    { provide: ProductionTrackingSettingsReader, useClass: PrismaProductionTrackingSettingsReader },
    {
      provide: ProductionTrackingSettingsRepository,
      useClass: PrismaProductionTrackingSettingsRepository,
    },
    {
      provide: ProductionTrackingSettingsVersion,
      useClass: PrismaProductionTrackingSettingsVersion,
    },
    { provide: FrozenTrackingLevelsReader, useClass: PrismaFrozenTrackingLevelsReader },
    { provide: DayTrackingLevelsFreezer, useClass: PrismaDayTrackingLevelsFreezer },
    { provide: TrackingLevelsCommissioning, useClass: ConstantTrackingLevelsCommissioning },
    // « Fait », le rouge et « Marquer traité » (`fournil/les-niveaux-de-suivi.md`) : l'écriture commune d'une fournée, la correction de ce qui a été
    // déclaré, la cloche d'après validation, et les problèmes — écrire et
    // lire les ouverts sont deux ports (ISP).
    BatchRecording,
    OutputCorrecting,
    ProblemBell,
    MarkLineDoneHandler,
    ReportProblemHandler,
    ResolveProblemHandler,
    ListOpenProductionProblemsHandler,
    { provide: ProductionProblemRepository, useClass: PrismaProductionProblemRepository },
    { provide: OpenProductionProblemsReader, useClass: PrismaOpenProductionProblemsReader },
    { provide: DayProblemsReader, useClass: PrismaDayProblemsReader },
    // Les étapes d'une ligne (`fournil/plan-produit-sur-plusieurs-postes.md`) :
    // les gestes, leur rouge à la Supervision, la coche d'office du toujours
    // vert — écrire, lire la journée et cocher d'office sont trois ports (ISP).
    LineStepGestures,
    MarkStepDoneHandler,
    MarkStepRedHandler,
    UndoStepHandler,
    StepRedsReading,
    AlwaysGreenStepsRound,
    { provide: LineStepRepository, useClass: PrismaLineStepRepository },
    { provide: DayLineStepsReader, useClass: PrismaDayLineStepsReader },
    { provide: AutomaticStepChecks, useClass: PrismaAutomaticStepChecks },
  ],
})
export class ProductionAtelierModule {}

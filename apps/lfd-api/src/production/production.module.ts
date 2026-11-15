import { Module } from "@nestjs/common";

import { BrandModule } from "../platform/brand/brand.module.js";
import { GetAtelierSheetPdfHandler } from "./atelier/application/queries/get-atelier-sheet-pdf.handler.js";
import { ProductionAtelierModule } from "./atelier/production-atelier.module.js";
import { ProductionDayModule } from "./day/production-day.module.js";
import { SendDossierOnDayClosed } from "./plan/application/handlers/send-dossier-on-day-closed.handler.js";
import { SendDossierOnDayRetaken } from "./plan/application/handlers/send-dossier-on-day-retaken.handler.js";
import { GetDayDossierPdfHandler } from "./plan/application/queries/get-day-dossier-pdf.handler.js";
import { GetProductionCountPdfHandler } from "./plan/application/queries/get-production-count-pdf.handler.js";
import { GetProductionForecastHandler } from "./plan/application/queries/get-production-forecast.handler.js";
import { GetProductionSettingsHandler } from "./plan/application/queries/get-production-settings.handler.js";
import { DossierDispatch } from "./plan/application/services/dossier-dispatch.service.js";
import { ProductionPaperRenderer } from "./plan/application/services/production-paper.service.js";
import { ProductionPlanModule } from "./plan/production-plan.module.js";
import { ProductionQualityModule } from "./quality/production-quality.module.js";
import { ProductionResupplyModule } from "./resupply/production-resupply.module.js";
import { ProductionPrintModule } from "./shared/print/production-print.module.js";

/**
 * **Le fournil** — la racine de composition du bloc : elle importe un module
 * par métier (la journée, le plan, l'atelier, la qualité, le réassort,
 * l'archivage des papiers) et réexporte ceux dont `appBootstrap` relie les
 * fournisseurs aux autres blocs.
 *
 * Il ne déclare PAS `DayOrdersReader` : c'est le port qu'il publie et que le
 * commerce implémente, relié dans la racine de composition
 * (`ProductionFeedModule`). Le retrait non plus : ce que le fournil en garde
 * est une question — `AttestedHandoversReader`, déclarée dans
 * `channels/handover/` et implémentée par le retrait.
 *
 * ⚠️ Neuf fournisseurs restent ici, et ce n'est pas leur place : le rendu des
 * papiers (`ProductionPaperRenderer`) est au plan et lit l'affichage de
 * l'atelier, la fiche PDF de l'atelier le lit en retour, et le prévisionnel
 * et les réglages du plan lisent aussi l'affichage. Les ranger dans le plan
 * ou dans l'atelier ferait importer l'un par l'autre — une arête que le
 * découpage refuse, et un cycle de modules dans un sens. Ils restent dans la
 * racine, qui voit les deux, jusqu'à ce que le plan du découpage tranche
 * (`documentation/fournil/plan-decoupage-du-fournil.md`, D6).
 */
@Module({
  imports: [
    ProductionDayModule,
    ProductionPrintModule,
    ProductionQualityModule,
    ProductionResupplyModule,
    ProductionPlanModule,
    ProductionAtelierModule,
    // Le logo de l'en-tête des papiers du fournil.
    BrandModule,
  ],
  providers: [
    ProductionPaperRenderer,
    GetAtelierSheetPdfHandler,
    GetProductionCountPdfHandler,
    GetDayDossierPdfHandler,
    // L'envoi du dossier : deux abonnés durables et le service qu'ils partagent.
    DossierDispatch,
    SendDossierOnDayClosed,
    SendDossierOnDayRetaken,
    GetProductionForecastHandler,
    GetProductionSettingsHandler,
  ],
  // Les fournisseurs que la racine de composition relie aux autres blocs,
  // chacun exporté par le module de son métier.
  exports: [
    ProductionDayModule,
    ProductionQualityModule,
    ProductionResupplyModule,
    ProductionPlanModule,
  ],
})
export class ProductionModule {}

import { Module } from "@nestjs/common";

import { ProductionAtelierModule } from "./atelier/production-atelier.module.js";
import { ProductionDayModule } from "./day/production-day.module.js";
import { ProductionPlanModule } from "./plan/production-plan.module.js";
import { ProductionQualityModule } from "./quality/production-quality.module.js";
import { ProductionResupplyModule } from "./resupply/production-resupply.module.js";
import { ProductionPrintModule } from "./shared/print/production-print.module.js";

/**
 * **Le fournil** — la racine de composition du bloc : elle importe un module
 * par métier (la journée, le plan, l'atelier, la qualité, le réassort,
 * l'imprimerie des papiers) et réexporte ceux dont `appBootstrap` relie les
 * fournisseurs aux autres blocs.
 *
 * Il ne déclare PAS `DayOrdersReader` : c'est le port qu'il publie et que le
 * commerce implémente, relié dans la racine de composition
 * (`ProductionFeedModule`). Le retrait non plus : ce que le fournil en garde
 * est une question — `AttestedHandoversReader`, déclarée dans
 * `channels/handover/` et implémentée par le retrait.
 *
 * Elle n'a aucun fournisseur propre : chacun est rangé dans le module de
 * son métier.
 */
@Module({
  imports: [
    ProductionDayModule,
    ProductionPrintModule,
    ProductionQualityModule,
    ProductionResupplyModule,
    ProductionPlanModule,
    ProductionAtelierModule,
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

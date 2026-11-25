import { Module } from "@nestjs/common";

import { ProductionDayModule } from "../day/production-day.module.js";
import { ProductionPrintModule } from "../shared/print/production-print.module.js";
import { GetProductionGroupingHandler } from "./application/queries/get-production-grouping.handler.js";
import { GetUnplacedProductsOfDayHandler } from "./application/queries/get-unplaced-products-of-day.handler.js";
import { GroupingSourceReading } from "./application/services/grouping-source-reading.service.js";
import { ProductionWorkstationReadingsController } from "./http/production-workstation-readings.controller.js";
import { AddWorkstationToProductsHandler } from "./application/commands/add-workstation-to-products.handler.js";
import { ArchiveWorkstationHandler } from "./application/commands/archive-workstation.handler.js";
import { DeclareWorkstationHandler } from "./application/commands/declare-workstation.handler.js";
import { PlaceProductsHandler } from "./application/commands/place-products.handler.js";
import { RemoveWorkstationFromProductsHandler } from "./application/commands/remove-workstation-from-products.handler.js";
import { RenameWorkstationHandler } from "./application/commands/rename-workstation.handler.js";
import { ReorderWorkstationProductsHandler } from "./application/commands/reorder-workstation-products.handler.js";
import { ReorderWorkstationsHandler } from "./application/commands/reorder-workstations.handler.js";
import { SetFinishingWorkstationHandler } from "./application/commands/set-finishing-workstation.handler.js";
import { SetWorkstationTrackingLevelHandler } from "./application/commands/set-workstation-tracking-level.handler.js";
import { ListWorkstationsHandler } from "./application/queries/list-workstations.handler.js";
import { WorkstationMapGesture } from "./application/services/workstation-map-gesture.service.js";
import { PlacedProducts } from "./domain/ports/placed-products.js";
import { WorkstationMapReader } from "./domain/ports/workstation-map.reader.js";
import { WorkstationMapRepository } from "./domain/ports/workstation-map.repository.js";
import { WorkstationOfProducts } from "./domain/ports/workstation-of-products.js";
import { WorkstationMapVersion } from "./domain/ports/workstation-map-version.js";
import { WorkstationTrackingLevels } from "./domain/ports/workstation-tracking-levels.js";
import { ProductionWorkstationsController } from "./http/production-workstations.controller.js";
import { PrismaWorkstationMapRepository } from "./infrastructure/prisma-workstation-map.repository.js";
import {
  PrismaPlacedProducts,
  PrismaWorkstationMapReader,
  PrismaWorkstationMapVersion,
  PrismaWorkstationOfProducts,
  PrismaWorkstationTrackingLevels,
} from "./infrastructure/prisma-workstation-readers.js";

/**
 * **Les postes du fournil** (`documentation/fournil/les-postes-du-fournil.md`) : la
 * carte des postes, ses cinq gestes par intention et la page Postes.
 *
 * Il sert aussi aux autres écrans du fournil le rangement de leurs SKU et
 * l'alerte du Prod manager (§ 3.7, § 3.10).
 *
 * Écrire la carte et la lire sont deux ports (ISP) ; il exporte les cinq
 * lectures que les autres métiers liront — le rangement de SKU et le poste
 * des produits (la fiche et le dossier), le compte des produits placés (la garde de bascule), le
 * numéro de la carte (l'étiquette de la fiche gardée) et le niveau de suivi
 * propre de chaque poste (le niveau figé d'une journée).
 */
@Module({
  // L'imprimerie : le réglage du rangement, que lisent la route du rangement et l'alerte.
  imports: [ProductionDayModule, ProductionPrintModule],
  controllers: [ProductionWorkstationsController, ProductionWorkstationReadingsController],
  providers: [
    WorkstationMapGesture,
    DeclareWorkstationHandler,
    RenameWorkstationHandler,
    ReorderWorkstationsHandler,
    ReorderWorkstationProductsHandler,
    ArchiveWorkstationHandler,
    PlaceProductsHandler,
    AddWorkstationToProductsHandler,
    RemoveWorkstationFromProductsHandler,
    SetFinishingWorkstationHandler,
    SetWorkstationTrackingLevelHandler,
    ListWorkstationsHandler,
    GetProductionGroupingHandler,
    GetUnplacedProductsOfDayHandler,
    GroupingSourceReading,
    { provide: WorkstationMapRepository, useClass: PrismaWorkstationMapRepository },
    { provide: WorkstationMapReader, useClass: PrismaWorkstationMapReader },
    { provide: WorkstationOfProducts, useClass: PrismaWorkstationOfProducts },
    { provide: PlacedProducts, useClass: PrismaPlacedProducts },
    { provide: WorkstationMapVersion, useClass: PrismaWorkstationMapVersion },
    { provide: WorkstationTrackingLevels, useClass: PrismaWorkstationTrackingLevels },
  ],
  exports: [
    GroupingSourceReading,
    WorkstationOfProducts,
    PlacedProducts,
    WorkstationMapVersion,
    WorkstationTrackingLevels,
  ],
})
export class ProductionWorkstationsModule {}

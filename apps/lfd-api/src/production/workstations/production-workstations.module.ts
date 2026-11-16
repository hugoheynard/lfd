import { Module } from "@nestjs/common";

import { ProductionDayModule } from "../day/production-day.module.js";
import { ProductionPrintModule } from "../shared/print/production-print.module.js";
import { GetProductionGroupingHandler } from "./application/queries/get-production-grouping.handler.js";
import { GetUnplacedProductsOfDayHandler } from "./application/queries/get-unplaced-products-of-day.handler.js";
import { GroupingSourceReading } from "./application/services/grouping-source-reading.service.js";
import { ProductionWorkstationReadingsController } from "./http/production-workstation-readings.controller.js";
import { ArchiveWorkstationHandler } from "./application/commands/archive-workstation.handler.js";
import { DeclareWorkstationHandler } from "./application/commands/declare-workstation.handler.js";
import { PlaceProductsHandler } from "./application/commands/place-products.handler.js";
import { RenameWorkstationHandler } from "./application/commands/rename-workstation.handler.js";
import { ReorderWorkstationsHandler } from "./application/commands/reorder-workstations.handler.js";
import { ListWorkstationsHandler } from "./application/queries/list-workstations.handler.js";
import { WorkstationMapGesture } from "./application/services/workstation-map-gesture.service.js";
import { PlacedProducts } from "./domain/ports/placed-products.js";
import { WorkstationMapReader } from "./domain/ports/workstation-map.reader.js";
import { WorkstationMapRepository } from "./domain/ports/workstation-map.repository.js";
import { WorkstationOfProducts } from "./domain/ports/workstation-of-products.js";
import { WorkstationMapVersion } from "./domain/ports/workstation-map-version.js";
import { ProductionWorkstationsController } from "./http/production-workstations.controller.js";
import { PrismaWorkstationMapRepository } from "./infrastructure/prisma-workstation-map.repository.js";
import {
  PrismaPlacedProducts,
  PrismaWorkstationMapReader,
  PrismaWorkstationMapVersion,
  PrismaWorkstationOfProducts,
} from "./infrastructure/prisma-workstation-readers.js";

/**
 * **Les postes du fournil** (plan `fournil/plan-postes-du-fournil.md`) : la
 * carte des postes, ses cinq gestes par intention et la page Postes.
 *
 * Il sert aussi aux autres écrans du fournil le rangement de leurs SKU et
 * l'alerte du Prod manager (§ 3.7, § 3.10).
 *
 * Écrire la carte et la lire sont deux ports (ISP) ; il exporte les trois
 * lectures que les autres métiers liront — le poste des produits (la fiche
 * et le dossier), le compte des produits placés (la garde de bascule) et le
 * numéro de la carte (l'étiquette de la fiche gardée).
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
    ArchiveWorkstationHandler,
    PlaceProductsHandler,
    ListWorkstationsHandler,
    GetProductionGroupingHandler,
    GetUnplacedProductsOfDayHandler,
    GroupingSourceReading,
    { provide: WorkstationMapRepository, useClass: PrismaWorkstationMapRepository },
    { provide: WorkstationMapReader, useClass: PrismaWorkstationMapReader },
    { provide: WorkstationOfProducts, useClass: PrismaWorkstationOfProducts },
    { provide: PlacedProducts, useClass: PrismaPlacedProducts },
    { provide: WorkstationMapVersion, useClass: PrismaWorkstationMapVersion },
  ],
  exports: [WorkstationOfProducts, PlacedProducts, WorkstationMapVersion],
})
export class ProductionWorkstationsModule {}

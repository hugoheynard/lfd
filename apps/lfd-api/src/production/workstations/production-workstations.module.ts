import { Module } from "@nestjs/common";

import { ProductionDayModule } from "../day/production-day.module.js";
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
import { ProductionWorkstationsController } from "./http/production-workstations.controller.js";
import { PrismaWorkstationMapRepository } from "./infrastructure/prisma-workstation-map.repository.js";
import {
  PrismaPlacedProducts,
  PrismaWorkstationMapReader,
  PrismaWorkstationOfProducts,
} from "./infrastructure/prisma-workstation-readers.js";

/**
 * **Les postes du fournil** (plan `fournil/plan-postes-du-fournil.md`) : la
 * carte des postes, ses cinq gestes par intention et la page Postes.
 *
 * Écrire la carte et la lire sont deux ports (ISP) ; il exporte les deux
 * lectures que les autres métiers liront — le poste des produits (la fiche
 * et le dossier) et le compte des produits placés (la garde de bascule).
 */
@Module({
  imports: [ProductionDayModule],
  controllers: [ProductionWorkstationsController],
  providers: [
    WorkstationMapGesture,
    DeclareWorkstationHandler,
    RenameWorkstationHandler,
    ReorderWorkstationsHandler,
    ArchiveWorkstationHandler,
    PlaceProductsHandler,
    ListWorkstationsHandler,
    { provide: WorkstationMapRepository, useClass: PrismaWorkstationMapRepository },
    { provide: WorkstationMapReader, useClass: PrismaWorkstationMapReader },
    { provide: WorkstationOfProducts, useClass: PrismaWorkstationOfProducts },
    { provide: PlacedProducts, useClass: PrismaPlacedProducts },
  ],
  exports: [WorkstationOfProducts, PlacedProducts],
})
export class ProductionWorkstationsModule {}

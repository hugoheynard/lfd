import { Module } from "@nestjs/common";

import { AddVehicleHandler } from "./application/commands/add-vehicle.handler.js";
import { ChooseDepartureHandler } from "./application/commands/choose-departure.handler.js";
import { CorrectVehicleHandler } from "./application/commands/correct-vehicle.handler.js";
import { ReactivateVehicleHandler } from "./application/commands/reactivate-vehicle.handler.js";
import { RetireVehicleHandler } from "./application/commands/retire-vehicle.handler.js";
import { GetDepartureHandler } from "./application/queries/get-departure.handler.js";
import { ListVehiclesHandler } from "./application/queries/list-vehicles.handler.js";
import { DepartureReader } from "./domain/ports/departure.reader.js";
import { DepartureRepository } from "./domain/ports/departure.repository.js";
import { FleetReader } from "./domain/ports/fleet.reader.js";
import { VehicleRepository } from "./domain/ports/vehicle.repository.js";
import { DepartureController } from "./http/departure.controller.js";
import { VehiclesController } from "./http/vehicles.controller.js";
import { PrismaDepartureReader } from "./infrastructure/prisma-departure.reader.js";
import { PrismaDepartureRepository } from "./infrastructure/prisma-departure.repository.js";
import { PrismaFleetReader } from "./infrastructure/prisma-fleet.reader.js";
import { PrismaVehicleRepository } from "./infrastructure/prisma-vehicle.repository.js";

/**
 * **La livraison** — les bases paramétrables des tournées : la flotte et le
 * point de départ (`documentation/livraisons/plan-preparation-de-tournee.md`,
 * lot 2). Code ici, tables dans le schéma `production` (Q10).
 *
 * Il ne déclare PAS `DepartureCandidatesReader` : c'est le port qu'il publie
 * et que le commerce implémente, relié dans la racine de composition
 * (`appBootstrap/delivery-feed.module.ts`). Le brancher ici obligerait ce
 * module à connaître `b2b`, ce que la matrice interdit.
 *
 * Style de fichiers : commande et handler SÉPARÉS, comme le B2B et ses
 * voisins hors référentiel (`handover/`, `production/`) — le style colocalisé
 * est celui du seul PIM (`CLAUDE.md` §4).
 */
@Module({
  controllers: [VehiclesController, DepartureController],
  providers: [
    AddVehicleHandler,
    CorrectVehicleHandler,
    RetireVehicleHandler,
    ReactivateVehicleHandler,
    ChooseDepartureHandler,
    ListVehiclesHandler,
    GetDepartureHandler,
    { provide: VehicleRepository, useClass: PrismaVehicleRepository },
    { provide: FleetReader, useClass: PrismaFleetReader },
    { provide: DepartureRepository, useClass: PrismaDepartureRepository },
    { provide: DepartureReader, useClass: PrismaDepartureReader },
  ],
})
export class DeliveryModule {}

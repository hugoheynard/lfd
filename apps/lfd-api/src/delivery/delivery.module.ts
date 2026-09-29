import { Module } from "@nestjs/common";

import { AddVehicleHandler } from "./application/commands/add-vehicle.handler.js";
import { AssignDeliveryStopHandler } from "./application/commands/assign-delivery-stop.handler.js";
import { ChooseDepartureHandler } from "./application/commands/choose-departure.handler.js";
import { CorrectVehicleHandler } from "./application/commands/correct-vehicle.handler.js";
import { MoveDeliveryStopHandler } from "./application/commands/move-delivery-stop.handler.js";
import { OpenDeliveryRoundHandler } from "./application/commands/open-delivery-round.handler.js";
import { ReactivateVehicleHandler } from "./application/commands/reactivate-vehicle.handler.js";
import { RemoveDeliveryStopHandler } from "./application/commands/remove-delivery-stop.handler.js";
import { ReorderDeliveryRoundHandler } from "./application/commands/reorder-delivery-round.handler.js";
import { RetireVehicleHandler } from "./application/commands/retire-vehicle.handler.js";
import { GetDeliveryRoundsDayHandler } from "./application/queries/get-delivery-rounds-day.handler.js";
import { GetDepartureHandler } from "./application/queries/get-departure.handler.js";
import { ListVehiclesHandler } from "./application/queries/list-vehicles.handler.js";
import { DeliveryRoundRepository } from "./domain/ports/delivery-round.repository.js";
import { DeliveryRoundsReader } from "./domain/ports/delivery-rounds.reader.js";
import { DepartureReader } from "./domain/ports/departure.reader.js";
import { DepartureRepository } from "./domain/ports/departure.repository.js";
import { FleetReader } from "./domain/ports/fleet.reader.js";
import { VehicleRoundsReader } from "./domain/ports/vehicle-rounds.reader.js";
import { VehicleRepository } from "./domain/ports/vehicle.repository.js";
import { DeliveryRoundsController } from "./http/delivery-rounds.controller.js";
import { DepartureController } from "./http/departure.controller.js";
import { VehiclesController } from "./http/vehicles.controller.js";
import { PrismaDeliveryRoundRepository } from "./infrastructure/prisma-delivery-round.repository.js";
import { PrismaDeliveryRoundsReader } from "./infrastructure/prisma-delivery-rounds.reader.js";
import { PrismaDepartureReader } from "./infrastructure/prisma-departure.reader.js";
import { PrismaDepartureRepository } from "./infrastructure/prisma-departure.repository.js";
import { PrismaFleetReader } from "./infrastructure/prisma-fleet.reader.js";
import { PrismaVehicleRoundsReader } from "./infrastructure/prisma-vehicle-rounds.reader.js";
import { PrismaVehicleRepository } from "./infrastructure/prisma-vehicle.repository.js";

/**
 * **La livraison** — les bases paramétrables des tournées (la flotte et le
 * point de départ, lot 2), puis la composition des tournées (lot 3)
 * (`documentation/livraisons/plan-preparation-de-tournee.md`). Code ici, tables
 * dans le schéma `production` (Q10).
 *
 * Il ne déclare PAS `DepartureCandidatesReader` ni `DeliveryOrdersReader` : ce
 * sont les ports qu'il publie et que le commerce implémente, relié dans la racine de composition
 * (`appBootstrap/delivery-feed.module.ts`). Le brancher ici obligerait ce
 * module à connaître `b2b`, ce que la matrice interdit.
 *
 * Style de fichiers : commande et handler SÉPARÉS, comme le B2B et ses
 * voisins hors référentiel (`handover/`, `production/`) — le style colocalisé
 * est celui du seul PIM (`CLAUDE.md` §4).
 */
@Module({
  controllers: [VehiclesController, DepartureController, DeliveryRoundsController],
  providers: [
    AddVehicleHandler,
    CorrectVehicleHandler,
    RetireVehicleHandler,
    ReactivateVehicleHandler,
    ChooseDepartureHandler,
    ListVehiclesHandler,
    GetDepartureHandler,
    OpenDeliveryRoundHandler,
    AssignDeliveryStopHandler,
    MoveDeliveryStopHandler,
    ReorderDeliveryRoundHandler,
    RemoveDeliveryStopHandler,
    GetDeliveryRoundsDayHandler,
    { provide: VehicleRepository, useClass: PrismaVehicleRepository },
    { provide: FleetReader, useClass: PrismaFleetReader },
    { provide: DepartureRepository, useClass: PrismaDepartureRepository },
    { provide: DepartureReader, useClass: PrismaDepartureReader },
    { provide: DeliveryRoundRepository, useClass: PrismaDeliveryRoundRepository },
    { provide: DeliveryRoundsReader, useClass: PrismaDeliveryRoundsReader },
    { provide: VehicleRoundsReader, useClass: PrismaVehicleRoundsReader },
  ],
})
export class DeliveryModule {}

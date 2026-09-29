import { Module } from "@nestjs/common";

import { AppConfig } from "../platform/config/app-config.js";
import { ApplyDeliveryProposalHandler } from "./application/commands/apply-delivery-proposal.handler.js";
import { LocateDeliveryStopsHandler } from "./application/commands/locate-delivery-stops.handler.js";
import { SetRoutingSettingsHandler } from "./application/commands/set-routing-settings.handler.js";
import { GetDeliveryRoundProposalHandler } from "./application/queries/get-delivery-round-proposal.handler.js";
import { TimeDeliveryRoundsHandler } from "./application/queries/time-delivery-rounds.handler.js";
import { SimulateDeliveryRoundsHandler } from "./application/queries/simulate-delivery-rounds.handler.js";
import { GetRoutingSettingsHandler } from "./application/queries/get-routing-settings.handler.js";
import { DeliveryProposalRepository } from "./domain/ports/delivery-proposal.repository.js";
import { DistanceMatrix } from "./domain/ports/distance-matrix.js";
import { GeocodeCacheReader } from "./domain/ports/geocode-cache.reader.js";
import { GeocodeCacheRepository } from "./domain/ports/geocode-cache.repository.js";
import { Geocoder } from "./domain/ports/geocoder.js";
import { RoutingSettingsReader } from "./domain/ports/routing-settings.reader.js";
import { RoutingSettingsRepository } from "./domain/ports/routing-settings.repository.js";
import { RouteGeometry } from "./domain/ports/route-geometry.js";
import { DeliveryProposalController } from "./http/delivery-proposal.controller.js";
import { DeliverySimulatorController } from "./http/delivery-simulator.controller.js";
import { RoutingSettingsController } from "./http/routing-settings.controller.js";
import { BanGeocoder } from "./infrastructure/ban-geocoder.js";
import { DisabledGeocoder } from "./infrastructure/disabled-geocoder.js";
import {
  DisabledDistanceMatrix,
  DisabledRouteGeometry,
} from "./infrastructure/disabled-road-routing.js";
import { OsrmDistanceMatrix } from "./infrastructure/osrm-distance-matrix.js";
import { OsrmRouteGeometry } from "./infrastructure/osrm-route-geometry.js";
import { PrismaDeliveryProposalRepository } from "./infrastructure/prisma-delivery-proposal.repository.js";
import { PrismaGeocodeCacheReader } from "./infrastructure/prisma-geocode-cache.reader.js";
import { PrismaGeocodeCacheRepository } from "./infrastructure/prisma-geocode-cache.repository.js";
import { PrismaRoutingSettingsReader } from "./infrastructure/prisma-routing-settings.reader.js";
import { PrismaRoutingSettingsRepository } from "./infrastructure/prisma-routing-settings.repository.js";

import { DeclareDeliveryBagsHandler } from "./application/commands/declare-delivery-bags.handler.js";
import { DepartDeliveryRoundHandler } from "./application/commands/depart-delivery-round.handler.js";
import { LoadDeliveryBagHandler } from "./application/commands/load-delivery-bag.handler.js";
import { UnloadDeliveryBagHandler } from "./application/commands/unload-delivery-bag.handler.js";
import { VoidDeliveryBagHandler } from "./application/commands/void-delivery-bag.handler.js";
import { GetDeliveryBagHandler } from "./application/queries/get-delivery-bag.handler.js";
import { GetDeliveryLoadingDayHandler } from "./application/queries/get-delivery-loading-day.handler.js";
import { GetDeliveryLoadingRoundHandler } from "./application/queries/get-delivery-loading-round.handler.js";
import { GetDeliveryOrderBagsHandler } from "./application/queries/get-delivery-order-bags.handler.js";
import { BagCodeDrawer } from "./domain/ports/bag-code-drawer.js";
import { DeliveryBagRepository } from "./domain/ports/delivery-bag.repository.js";
import { DeliveryLoadingReader } from "./domain/ports/delivery-loading.reader.js";
import { DepartedStopRepository } from "./domain/ports/departed-stop.repository.js";
import { LoadedStopsReader } from "./domain/ports/loaded-stops.reader.js";
import { StopLoadingRepository } from "./domain/ports/stop-loading.repository.js";
import { DeliveryBagsController } from "./http/delivery-bags.controller.js";
import { DeliveryLoadingController } from "./http/delivery-loading.controller.js";
import { CryptoBagCodeDrawer } from "./infrastructure/crypto-bag-code-drawer.js";
import { PrismaDeliveryBagRepository } from "./infrastructure/prisma-delivery-bag.repository.js";
import { PrismaDeliveryLoadingReader } from "./infrastructure/prisma-delivery-loading.reader.js";
import { PrismaDepartedStopRepository } from "./infrastructure/prisma-departed-stop.repository.js";
import { PrismaLoadedStopsReader } from "./infrastructure/prisma-loaded-stops.reader.js";
import { PrismaStopLoadingRepository } from "./infrastructure/prisma-stop-loading.repository.js";
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
 * point de départ, lot 2), la composition des tournées (lot 3), puis les
 * sacs, leur chargement et le départ (lot 4), puis le calculateur de tournée
 * (lot 7), par la route (lot 8), et « Chronométrer » (lot 10 bis)
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
  controllers: [
    VehiclesController,
    DepartureController,
    DeliveryRoundsController,
    DeliveryBagsController,
    DeliveryLoadingController,
    RoutingSettingsController,
    DeliveryProposalController,
    DeliverySimulatorController,
  ],
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
    DeclareDeliveryBagsHandler,
    VoidDeliveryBagHandler,
    LoadDeliveryBagHandler,
    UnloadDeliveryBagHandler,
    DepartDeliveryRoundHandler,
    GetDeliveryOrderBagsHandler,
    GetDeliveryBagHandler,
    GetDeliveryLoadingRoundHandler,
    GetDeliveryLoadingDayHandler,
    GetRoutingSettingsHandler,
    SetRoutingSettingsHandler,
    LocateDeliveryStopsHandler,
    GetDeliveryRoundProposalHandler,
    ApplyDeliveryProposalHandler,
    SimulateDeliveryRoundsHandler,
    TimeDeliveryRoundsHandler,
    { provide: VehicleRepository, useClass: PrismaVehicleRepository },
    { provide: FleetReader, useClass: PrismaFleetReader },
    { provide: DepartureRepository, useClass: PrismaDepartureRepository },
    { provide: DepartureReader, useClass: PrismaDepartureReader },
    { provide: DeliveryRoundRepository, useClass: PrismaDeliveryRoundRepository },
    { provide: DeliveryRoundsReader, useClass: PrismaDeliveryRoundsReader },
    { provide: VehicleRoundsReader, useClass: PrismaVehicleRoundsReader },
    { provide: DeliveryBagRepository, useClass: PrismaDeliveryBagRepository },
    { provide: StopLoadingRepository, useClass: PrismaStopLoadingRepository },
    { provide: DepartedStopRepository, useClass: PrismaDepartedStopRepository },
    { provide: LoadedStopsReader, useClass: PrismaLoadedStopsReader },
    { provide: DeliveryLoadingReader, useClass: PrismaDeliveryLoadingReader },
    { provide: BagCodeDrawer, useClass: CryptoBagCodeDrawer },
    { provide: RoutingSettingsReader, useClass: PrismaRoutingSettingsReader },
    { provide: RoutingSettingsRepository, useClass: PrismaRoutingSettingsRepository },
    { provide: GeocodeCacheReader, useClass: PrismaGeocodeCacheReader },
    { provide: GeocodeCacheRepository, useClass: PrismaGeocodeCacheRepository },
    { provide: DeliveryProposalRepository, useClass: PrismaDeliveryProposalRepository },
    // Sans URL, le calcul routier REFUSE (L10b-C5) : plus de vol d'oiseau.
    {
      provide: DistanceMatrix,
      inject: [AppConfig],
      useFactory: (config: AppConfig): DistanceMatrix => {
        const url = config.osrmUrl();
        return url === null ? new DisabledDistanceMatrix() : new OsrmDistanceMatrix(url);
      },
    },
    // Sans URL, pas de tracé : la carte montre les repères seuls (L10b-C4).
    {
      provide: RouteGeometry,
      inject: [AppConfig],
      useFactory: (config: AppConfig): RouteGeometry => {
        const url = config.osrmUrl();
        return url === null ? new DisabledRouteGeometry() : new OsrmRouteGeometry(url);
      },
    },
    // Sans URL, le géocodage est DÉSACTIVÉ (L7-C9) : les e2e ne sortent pas sur le réseau.
    {
      provide: Geocoder,
      inject: [AppConfig],
      useFactory: (config: AppConfig): Geocoder => {
        const url = config.geocoderUrl();
        return url === null ? new DisabledGeocoder() : new BanGeocoder(url);
      },
    },
  ],
})
export class DeliveryModule {}

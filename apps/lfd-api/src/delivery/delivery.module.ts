import { Module } from "@nestjs/common";

import { AddBinTypeHandler } from "./application/commands/add-bin-type.handler.js";
import { ArchiveBinTypeHandler } from "./application/commands/archive-bin-type.handler.js";
import { CorrectBinTypeHandler } from "./application/commands/correct-bin-type.handler.js";
import { ReactivateBinTypeHandler } from "./application/commands/reactivate-bin-type.handler.js";
import { SetBinCapacityHandler } from "./application/commands/set-bin-capacity.handler.js";
import { GetBinCapacitiesHandler } from "./application/queries/get-bin-capacities.handler.js";
import { ListBinTypesHandler } from "./application/queries/list-bin-types.handler.js";
import { BinCapacityRepository } from "./domain/ports/bin-capacity.repository.js";
import { BinCatalogReader } from "./domain/ports/bin-catalog.reader.js";
import { BinTypeLookup } from "./domain/ports/bin-type-lookup.js";
import { BinTypeRepository } from "./domain/ports/bin-type.repository.js";
import { BinCapacitiesController } from "./http/bin-capacities.controller.js";
import { BinTypesController } from "./http/bin-types.controller.js";
import { PrismaBinCapacityRepository } from "./infrastructure/prisma-bin-capacity.repository.js";
import { PrismaBinCatalogReader } from "./infrastructure/prisma-bin-catalog.reader.js";
import { PrismaBinTypeRepository } from "./infrastructure/prisma-bin-type.repository.js";
import { AppConfig } from "../platform/config/app-config.js";
import { ApplyDeliveryProposalHandler } from "./application/commands/apply-delivery-proposal.handler.js";
import { LocateDeliveryStopsHandler } from "./application/commands/locate-delivery-stops.handler.js";
import { SetRoutingSettingsHandler } from "./application/commands/set-routing-settings.handler.js";
import { GetDeliveryRoundProposalHandler } from "./application/queries/get-delivery-round-proposal.handler.js";
import { TimeDeliveryRoundsHandler } from "./application/queries/time-delivery-rounds.handler.js";
import { SimulateDeliveryRoundsHandler } from "./application/queries/simulate-delivery-rounds.handler.js";
import { ArchiveSimulationScenarioHandler } from "./application/commands/archive-simulation-scenario.handler.js";
import { DuplicateSimulationScenarioHandler } from "./application/commands/duplicate-simulation-scenario.handler.js";
import { RecordSimulationScenarioHandler } from "./application/commands/record-simulation-scenario.handler.js";
import { ReplaceSimulationScenarioHandler } from "./application/commands/replace-simulation-scenario.handler.js";
import { GetSimulationFromDayHandler } from "./application/queries/get-simulation-from-day.handler.js";
import { GetSimulationScenarioHandler } from "./application/queries/get-simulation-scenario.handler.js";
import { ListSimulationScenariosHandler } from "./application/queries/list-simulation-scenarios.handler.js";
import { SimulationScenarioReader } from "./domain/ports/simulation-scenario.reader.js";
import { SimulationScenarioRepository } from "./domain/ports/simulation-scenario.repository.js";
import { DeliverySimulationScenariosController } from "./http/delivery-simulation-scenarios.controller.js";
import { PrismaSimulationScenarioReader } from "./infrastructure/prisma-simulation-scenario.reader.js";
import { PrismaSimulationScenarioRepository } from "./infrastructure/prisma-simulation-scenario.repository.js";
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

import { DeclareDeliveryBinsHandler } from "./application/commands/declare-delivery-bins.handler.js";
import { ShareDeliveryBinHandler } from "./application/commands/share-delivery-bin.handler.js";
import { DepartDeliveryRoundHandler } from "./application/commands/depart-delivery-round.handler.js";
import { LoadDeliveryBinHandler } from "./application/commands/load-delivery-bin.handler.js";
import { UnloadDeliveryBinHandler } from "./application/commands/unload-delivery-bin.handler.js";
import { VoidDeliveryBinHandler } from "./application/commands/void-delivery-bin.handler.js";
import { GetDeliveryBinHandler } from "./application/queries/get-delivery-bin.handler.js";
import { GetDeliveryLoadingDayHandler } from "./application/queries/get-delivery-loading-day.handler.js";
import { GetDeliveryLoadingRoundHandler } from "./application/queries/get-delivery-loading-round.handler.js";
import { GetDeliveryOrderBinsHandler } from "./application/queries/get-delivery-order-bins.handler.js";
import { BinCodeDrawer } from "./domain/ports/bin-code-drawer.js";
import { DeliveryBinRepository } from "./domain/ports/delivery-bin.repository.js";
import { DeliveryLoadingReader } from "./domain/ports/delivery-loading.reader.js";
import { DepartedStopRepository } from "./domain/ports/departed-stop.repository.js";
import { LoadedStopsReader } from "./domain/ports/loaded-stops.reader.js";
import { StopLoadingRepository } from "./domain/ports/stop-loading.repository.js";
import { DeliveryBinsController } from "./http/delivery-bins.controller.js";
import { DeliveryLoadingController } from "./http/delivery-loading.controller.js";
import { CryptoBinCodeDrawer } from "./infrastructure/crypto-bin-code-drawer.js";
import { PrismaDeliveryBinRepository } from "./infrastructure/prisma-delivery-bin.repository.js";
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
 * bacs, leur chargement et le départ (lot 4), puis le calculateur de tournée
 * (lot 7), par la route (lot 8), « Chronométrer » (lot 10 bis), et le
 * catalogue des bacs avec leurs contenances (lot 4 bis, tranche A)
 * (`documentation/livraisons/plan-preparation-de-tournee.md`). Code ici, tables
 * dans le schéma `production` (Q10).
 *
 * Il ne déclare PAS `DepartureCandidatesReader`, `DeliveryOrdersReader` ni
 * `DeliveryProductsReader` : ce
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
    DeliveryBinsController,
    DeliveryLoadingController,
    RoutingSettingsController,
    DeliveryProposalController,
    DeliverySimulatorController,
    DeliverySimulationScenariosController,
    BinTypesController,
    BinCapacitiesController,
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
    DeclareDeliveryBinsHandler,
    ShareDeliveryBinHandler,
    VoidDeliveryBinHandler,
    LoadDeliveryBinHandler,
    UnloadDeliveryBinHandler,
    DepartDeliveryRoundHandler,
    GetDeliveryOrderBinsHandler,
    GetDeliveryBinHandler,
    GetDeliveryLoadingRoundHandler,
    GetDeliveryLoadingDayHandler,
    GetRoutingSettingsHandler,
    SetRoutingSettingsHandler,
    LocateDeliveryStopsHandler,
    GetDeliveryRoundProposalHandler,
    ApplyDeliveryProposalHandler,
    SimulateDeliveryRoundsHandler,
    RecordSimulationScenarioHandler,
    ReplaceSimulationScenarioHandler,
    DuplicateSimulationScenarioHandler,
    ArchiveSimulationScenarioHandler,
    ListSimulationScenariosHandler,
    GetSimulationScenarioHandler,
    GetSimulationFromDayHandler,
    { provide: SimulationScenarioRepository, useClass: PrismaSimulationScenarioRepository },
    { provide: SimulationScenarioReader, useClass: PrismaSimulationScenarioReader },
    TimeDeliveryRoundsHandler,
    AddBinTypeHandler,
    CorrectBinTypeHandler,
    ArchiveBinTypeHandler,
    ReactivateBinTypeHandler,
    SetBinCapacityHandler,
    ListBinTypesHandler,
    GetBinCapacitiesHandler,
    { provide: BinTypeRepository, useClass: PrismaBinTypeRepository },
    { provide: BinTypeLookup, useExisting: BinTypeRepository },
    { provide: BinCapacityRepository, useClass: PrismaBinCapacityRepository },
    { provide: BinCatalogReader, useClass: PrismaBinCatalogReader },
    { provide: VehicleRepository, useClass: PrismaVehicleRepository },
    { provide: FleetReader, useClass: PrismaFleetReader },
    { provide: DepartureRepository, useClass: PrismaDepartureRepository },
    { provide: DepartureReader, useClass: PrismaDepartureReader },
    { provide: DeliveryRoundRepository, useClass: PrismaDeliveryRoundRepository },
    { provide: DeliveryRoundsReader, useClass: PrismaDeliveryRoundsReader },
    { provide: VehicleRoundsReader, useClass: PrismaVehicleRoundsReader },
    { provide: DeliveryBinRepository, useClass: PrismaDeliveryBinRepository },
    { provide: StopLoadingRepository, useClass: PrismaStopLoadingRepository },
    { provide: DepartedStopRepository, useClass: PrismaDepartedStopRepository },
    { provide: LoadedStopsReader, useClass: PrismaLoadedStopsReader },
    { provide: DeliveryLoadingReader, useClass: PrismaDeliveryLoadingReader },
    { provide: BinCodeDrawer, useClass: CryptoBinCodeDrawer },
    { provide: RoutingSettingsReader, useClass: PrismaRoutingSettingsReader },
    { provide: RoutingSettingsRepository, useClass: PrismaRoutingSettingsRepository },
    { provide: GeocodeCacheReader, useClass: PrismaGeocodeCacheReader },
    { provide: GeocodeCacheRepository, useClass: PrismaGeocodeCacheRepository },
    { provide: DeliveryProposalRepository, useClass: PrismaDeliveryProposalRepository },
    // Sans adresse (ou, en production, sans jeton ni https — L8b-C4), le calcul
    // routier REFUSE (L10b-C5) : plus de vol d'oiseau.
    {
      provide: DistanceMatrix,
      inject: [AppConfig],
      useFactory: (config: AppConfig): DistanceMatrix => {
        const endpoint = config.routePlannerEndpoint();
        return endpoint === null ? new DisabledDistanceMatrix() : new OsrmDistanceMatrix(endpoint);
      },
    },
    // Sans URL, pas de tracé : la carte montre les repères seuls (L10b-C4).
    {
      provide: RouteGeometry,
      inject: [AppConfig],
      useFactory: (config: AppConfig): RouteGeometry => {
        const endpoint = config.routePlannerEndpoint();
        return endpoint === null ? new DisabledRouteGeometry() : new OsrmRouteGeometry(endpoint);
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

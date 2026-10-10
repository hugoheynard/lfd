import { Module } from "@nestjs/common";

import { ApplyDeliveryProposalHandler } from "./application/commands/apply-delivery-proposal.handler.js";
import { RoundTimingEstimator } from "./application/round-timing-estimator.js";
import { LocateDeliveryStopsHandler } from "./application/commands/locate-delivery-stops.handler.js";
import { SetRoutingSettingsHandler } from "./application/commands/set-routing-settings.handler.js";
import { SetDoorstepSettingsHandler } from "./application/commands/set-doorstep-settings.handler.js";
import { GetDeliveryRoundProposalHandler } from "./application/queries/get-delivery-round-proposal.handler.js";
import { GetDeliveryPlacementSuggestionsHandler } from "./application/queries/get-delivery-placement-suggestions.handler.js";
import { TimeDeliveryRoundsHandler } from "./application/queries/time-delivery-rounds.handler.js";
import { SimulateDeliveryRoundsHandler } from "./application/queries/simulate-delivery-rounds.handler.js";
import { GetRoutingSettingsHandler } from "./application/queries/get-routing-settings.handler.js";
import { GetDoorstepSettingsHandler } from "./application/queries/get-doorstep-settings.handler.js";
import { DeliveryProposalRepository } from "./domain/ports/delivery-proposal.repository.js";
import { GeocodeCacheReader } from "./domain/ports/geocode-cache.reader.js";
import { GeocodeCacheRepository } from "./domain/ports/geocode-cache.repository.js";
import { RoutingSettingsReader } from "./domain/ports/routing-settings.reader.js";
import { RoutingSettingsRepository } from "./domain/ports/routing-settings.repository.js";
import { DoorstepSettingsReader } from "./domain/ports/doorstep-settings.reader.js";
import { DoorstepSettingsRepository } from "./domain/ports/doorstep-settings.repository.js";
import { DeliveryProposalController } from "./http/delivery-proposal.controller.js";
import { DeliverySimulatorController } from "./http/delivery-simulator.controller.js";
import { DeliveryPurchaseAssistantController } from "./http/delivery-purchase-assistant.controller.js";
import { AssistBinPurchaseHandler } from "./application/queries/assist-bin-purchase.handler.js";
import { RoutingSettingsController } from "./http/routing-settings.controller.js";
import { DoorstepSettingsController } from "./http/doorstep-settings.controller.js";
import { PrismaDeliveryProposalRepository } from "./infrastructure/prisma-delivery-proposal.repository.js";
import { PrismaGeocodeCacheReader } from "./infrastructure/prisma-geocode-cache.reader.js";
import { PrismaGeocodeCacheRepository } from "./infrastructure/prisma-geocode-cache.repository.js";
import { PrismaRoutingSettingsReader } from "./infrastructure/prisma-routing-settings.reader.js";
import { PrismaRoutingSettingsRepository } from "./infrastructure/prisma-routing-settings.repository.js";
import { PrismaDoorstepSettingsReader } from "./infrastructure/prisma-doorstep-settings.reader.js";
import { PrismaDoorstepSettingsRepository } from "./infrastructure/prisma-doorstep-settings.repository.js";

import { DeliveryBinDesk } from "./application/delivery-bin-desk.js";
import { DeliveryBinOffice } from "./application/delivery-bin-office.js";
import { DepartDeliveryRoundHandler } from "./application/commands/depart-delivery-round.handler.js";
import { LoadDeliveryBinHandler } from "./application/commands/load-delivery-bin.handler.js";
import { UnloadDeliveryBinHandler } from "./application/commands/unload-delivery-bin.handler.js";
import { VoidDeliveryBinHandler } from "./application/commands/void-delivery-bin.handler.js";
import { GetDeliveryBinHandler } from "./application/queries/get-delivery-bin.handler.js";
import { GetDeliveryLoadingDayHandler } from "./application/queries/get-delivery-loading-day.handler.js";
import { GetDeliveryLoadingPlanHandler } from "./application/queries/get-delivery-loading-plan.handler.js";
import { GetDeliveryLoadingRoundHandler } from "./application/queries/get-delivery-loading-round.handler.js";
import { GetDeliveryOrderBinsHandler } from "./application/queries/get-delivery-order-bins.handler.js";
import { GetDeliveryBinFreeHalvesHandler } from "./application/queries/get-delivery-bin-free-halves.handler.js";
import { GetDeliveryPackingProposalHandler } from "./application/queries/get-delivery-packing-proposal.handler.js";
import { GetDeliveryPackingRoundsHandler } from "./application/queries/get-delivery-packing-rounds.handler.js";
import { DeliveryPackingController } from "./http/delivery-packing.controller.js";
import { BinCodeDrawer } from "./domain/ports/bin-code-drawer.js";
import { DeliveryBinRepository } from "./domain/ports/delivery-bin.repository.js";
import { LoadingPlanReader } from "./domain/ports/loading-plan.reader.js";
import { DeliveryLoadingReader } from "./domain/ports/delivery-loading.reader.js";
import { DepartedStopRepository } from "./domain/ports/departed-stop.repository.js";
import { LoadedStopsReader } from "./domain/ports/loaded-stops.reader.js";
import { StopLoadingRepository } from "./domain/ports/stop-loading.repository.js";
import { DeliveryBinsController } from "./http/delivery-bins.controller.js";
import { DeliveryLoadingController } from "./http/delivery-loading.controller.js";
import { CryptoBinCodeDrawer } from "./infrastructure/crypto-bin-code-drawer.js";
import { PrismaDeliveryBinRepository } from "./infrastructure/prisma-delivery-bin.repository.js";
import { PrismaLoadingPlanReader } from "./infrastructure/prisma-loading-plan.reader.js";
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
import { COMPOSITION_PREREQUISITES_PROVIDERS } from "./composition-prerequisites.providers.js";
import { DAY_JOURNAL_CONTROLLERS, DAY_JOURNAL_PROVIDERS } from "./day-journal.providers.js";
import { GEOCODE_PURGE_CONTROLLERS, GEOCODE_PURGE_PROVIDERS } from "./geocode-purge.providers.js";
import {
  POSITION_PURGE_CONTROLLERS,
  POSITION_PURGE_PROVIDERS,
} from "./position-purge.providers.js";
import {
  ADDRESS_SUGGESTIONS_CONTROLLERS,
  ADDRESS_SUGGESTIONS_PROVIDERS,
} from "./address-suggestions.providers.js";
import { DayAutoComposition } from "./application/day-auto-composition.js";
import { DayComposer } from "./application/day-composer.js";
import { DeliveryStopsLocating } from "./application/delivery-stops-locating.js";
import { DAY_READINESS_CONTROLLERS, DAY_READINESS_PROVIDERS } from "./day-readiness.providers.js";
import { BIN_CATALOGUE_CONTROLLERS, BIN_CATALOGUE_PROVIDERS } from "./bin-catalogue.providers.js";
import { ROAD_ROUTING_PROVIDERS } from "./road-routing.providers.js";
import {
  SIMULATION_SCENARIOS_CONTROLLERS,
  SIMULATION_SCENARIOS_PROVIDERS,
} from "./simulation-scenarios.providers.js";
import { DOORSTEP_CONTROLLERS, DOORSTEP_PROVIDERS } from "./doorstep.providers.js";
import { DRIVER_CONTROLLERS, DRIVER_PROVIDERS } from "./driver.providers.js";
import { ROUND_PAPER_CONTROLLERS, ROUND_PAPER_PROVIDERS } from "./round-paper.providers.js";
import {
  PURCHASE_LIBRARY_CONTROLLERS,
  PURCHASE_LIBRARY_PROVIDERS,
} from "./purchase-library.providers.js";

/**
 * **La livraison** — les bases paramétrables des tournées (la flotte et le
 * point de départ, lot 2), la composition des tournées (lot 3), puis les
 * bacs, leur chargement et le départ (lot 4), puis le calculateur de tournée
 * (lot 7), par la route (lot 8), « Chronométrer » (lot 10 bis), et le
 * catalogue des bacs avec leurs contenances (lot 4 bis, tranche A)
 * (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`). Code ici, tables
 * dans le schéma `delivery` depuis le 2026-09-30 (`plan-schema-delivery.md`,
 * qui revient sur Q10).
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
    DeliveryPackingController,
    DeliveryLoadingController,
    RoutingSettingsController,
    DoorstepSettingsController,
    DeliveryProposalController,
    DeliverySimulatorController,
    DeliveryPurchaseAssistantController,
    ...SIMULATION_SCENARIOS_CONTROLLERS,
    ...BIN_CATALOGUE_CONTROLLERS,
    ...PURCHASE_LIBRARY_CONTROLLERS,
    ...DAY_JOURNAL_CONTROLLERS,
    ...GEOCODE_PURGE_CONTROLLERS,
    ...POSITION_PURGE_CONTROLLERS,
    ...ADDRESS_SUGGESTIONS_CONTROLLERS,
    ...DAY_READINESS_CONTROLLERS,
    ...DRIVER_CONTROLLERS,
    ...ROUND_PAPER_CONTROLLERS,
    ...DOORSTEP_CONTROLLERS,
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
    // Le guichet des bacs (K2b) : servi au colisage, qui l'atteint par
    // `BinDesk` (relié par `PackingBinsModule`), et à l'annulation de la
    // livraison. Déclarer et partager n'ont plus de route ici (2026-10-10).
    DeliveryBinOffice,
    DeliveryBinDesk,
    VoidDeliveryBinHandler,
    LoadDeliveryBinHandler,
    UnloadDeliveryBinHandler,
    DepartDeliveryRoundHandler,
    GetDeliveryOrderBinsHandler,
    GetDeliveryBinFreeHalvesHandler,
    GetDeliveryPackingProposalHandler,
    GetDeliveryPackingRoundsHandler,
    GetDeliveryBinHandler,
    GetDeliveryLoadingRoundHandler,
    GetDeliveryLoadingPlanHandler,
    GetDeliveryLoadingDayHandler,
    GetRoutingSettingsHandler,
    SetRoutingSettingsHandler,
    // La décision réglée d'avance à la porte, globale (B3 bis) : lue aussi au départ.
    GetDoorstepSettingsHandler,
    SetDoorstepSettingsHandler,
    LocateDeliveryStopsHandler,
    GetDeliveryRoundProposalHandler,
    GetDeliveryPlacementSuggestionsHandler,
    ApplyDeliveryProposalHandler,
    DayAutoComposition,
    { provide: DayComposer, useExisting: DayAutoComposition },
    // L'horaire prévu d'une tournée appliquée (I10), rechronométré par le serveur.
    RoundTimingEstimator,
    SimulateDeliveryRoundsHandler,
    AssistBinPurchaseHandler,
    ...SIMULATION_SCENARIOS_PROVIDERS,
    TimeDeliveryRoundsHandler,
    ...BIN_CATALOGUE_PROVIDERS,
    ...PURCHASE_LIBRARY_PROVIDERS,
    ...DAY_JOURNAL_PROVIDERS,
    ...GEOCODE_PURGE_PROVIDERS,
    ...POSITION_PURGE_PROVIDERS,
    ...ADDRESS_SUGGESTIONS_PROVIDERS,
    ...DAY_READINESS_PROVIDERS,
    ...COMPOSITION_PREREQUISITES_PROVIDERS,
    ...DRIVER_PROVIDERS,
    ...ROUND_PAPER_PROVIDERS,
    ...DOORSTEP_PROVIDERS,
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
    { provide: LoadingPlanReader, useClass: PrismaLoadingPlanReader },
    { provide: BinCodeDrawer, useClass: CryptoBinCodeDrawer },
    { provide: RoutingSettingsReader, useClass: PrismaRoutingSettingsReader },
    { provide: RoutingSettingsRepository, useClass: PrismaRoutingSettingsRepository },
    { provide: DoorstepSettingsReader, useClass: PrismaDoorstepSettingsReader },
    { provide: DoorstepSettingsRepository, useClass: PrismaDoorstepSettingsRepository },
    { provide: GeocodeCacheReader, useClass: PrismaGeocodeCacheReader },
    { provide: GeocodeCacheRepository, useClass: PrismaGeocodeCacheRepository },
    { provide: DeliveryProposalRepository, useClass: PrismaDeliveryProposalRepository },
    ...ROAD_ROUTING_PROVIDERS,
  ],
  exports: [DeliveryBinDesk, DeliveryStopsLocating],
})
export class DeliveryModule {}

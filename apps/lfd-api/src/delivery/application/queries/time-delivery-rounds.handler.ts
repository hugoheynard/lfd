import type { DeliveryRoundTimingView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { DeliveryOrdersReader, DepartureCandidatesReader } from "../../channels/commerce/index.js";
import { BroughtBackOrdersReader } from "../../domain/ports/brought-back-orders.reader.js";
import { DeliveryRoundsReader } from "../../domain/ports/delivery-rounds.reader.js";
import { DepartureReader } from "../../domain/ports/departure.reader.js";
import { DistanceMatrix } from "../../domain/ports/distance-matrix.js";
import { FleetReader } from "../../domain/ports/fleet.reader.js";
import { GeocodeCacheReader } from "../../domain/ports/geocode-cache.reader.js";
import { LoadedStopsReader } from "../../domain/ports/loaded-stops.reader.js";
import { RouteGeometry } from "../../domain/ports/route-geometry.js";
import { RoutingSettingsReader } from "../../domain/ports/routing-settings.reader.js";
import { RoutingVehicleNotFoundError } from "../../domain/errors/delivery-routing-errors.js";
import type { PlanningVehicle } from "../../domain/services/proposal.js";
import { placementLateOrders } from "../../domain/services/placement-lateness.js";
import { type ComposedRound, timeComposition } from "../../domain/services/time-composition.js";
import type { GeoPoint } from "../../domain/value-objects/geo-point.js";
import { chosenVehicles } from "../delivery-proposal-support.js";
import { timedRoundView } from "../delivery-proposal-view.js";
import { routeLinesOf } from "../delivery-route-lines.js";
import {
  locatedDeparture,
  locateFromCache,
  type LocatedStop,
  routingSettingsOf,
  routingStopFor,
} from "../delivery-routing-support.js";
import {
  ensureOrdersTimeable,
  ensureRoundsTimeable,
  ensureStopsLocated,
} from "../delivery-timing-support.js";
import { TimeDeliveryRoundsQuery } from "./time-delivery-rounds.query.js";

/** L'identifiant du départ dans la matrice : aucun identifiant de commande ne le porte. */
const DEPOT_ID = "depot";

/**
 * **Chronométrer** (L10b-C2) : la composition glissée à l'écran, dans l'ordre
 * donné, avec les réglages en vigueur et le départ réglé — `timeRoute` du
 * domaine, par la route. N'écrit rien ; ne sort que vers la carte routière.
 * Chaque arrêt dit si sa place le rend intenable (CA5, l'alerte rouge) : le
 * calcul le nomme, il ne le déplace pas.
 *
 * Refuse ce qu'« Appliquer » refuserait : commande inconnue, d'un autre jour,
 * annulée ou au comptoir ; tournée inconnue ; tournée partie ou chargée dont
 * la composition diffère (I6) ; véhicule inconnu ou retiré ; arrêt non situé.
 *
 * @throws {OrderNotAssignableError} @throws {InvalidProposalError}
 * @throws {DeliveryRoundNotFoundError} @throws {LockedRoundRecomposedError}
 * @throws {RoutingVehicleNotFoundError} @throws {VehicleInactiveOnDayError}
 * @throws {StopNotLocatedError} @throws {DepartureNotLocatedError}
 * @throws {RoadRoutingUnavailableError}
 */
@QueryHandler(TimeDeliveryRoundsQuery)
export class TimeDeliveryRoundsHandler implements IQueryHandler<
  TimeDeliveryRoundsQuery,
  DeliveryRoundTimingView
> {
  constructor(
    private readonly settings: RoutingSettingsReader,
    private readonly departure: DepartureReader,
    private readonly candidates: DepartureCandidatesReader,
    private readonly fleet: FleetReader,
    private readonly rounds: DeliveryRoundsReader,
    private readonly orders: DeliveryOrdersReader,
    private readonly broughtBack: BroughtBackOrdersReader,
    private readonly loadedStops: LoadedStopsReader,
    private readonly cache: GeocodeCacheReader,
    private readonly matrix: DistanceMatrix,
    private readonly geometry: RouteGeometry,
    private readonly clock: Clock,
  ) {}

  async execute({ composition }: TimeDeliveryRoundsQuery): Promise<DeliveryRoundTimingView> {
    const orderIds = composition.rounds.flatMap((round) => round.orderIds);
    const [facts, broughtBack] = await Promise.all([
      this.orders.byIds(orderIds),
      this.broughtBack.lastAmong(orderIds),
    ]);
    ensureOrdersTimeable(
      composition,
      new Map(facts.map((order) => [order.orderId, order])),
      new Set(broughtBack.keys()),
    );
    const vehicles = await chosenVehicles(
      this.fleet,
      composition.day,
      composition.rounds.map((round) => round.vehicleId),
    );
    const dayRounds = await this.rounds.roundsOn(composition.day);
    const loaded = await this.loadedStops.loadedAmong(
      dayRounds.flatMap((round) => round.stops.map((stop) => stop.stopId)),
    );
    ensureRoundsTimeable(composition, dayRounds, loaded);
    const stops = await this.locate(orderIds);
    ensureStopsLocated(orderIds, stops);
    const { settings } = await routingSettingsOf(this.settings);
    const departure = await locatedDeparture(this.departure, this.candidates);
    const cost = await this.matrix.build(pointsOf(departure.point, orderIds, stops));
    const tours = timeComposition({
      depotId: DEPOT_ID,
      rounds: composedRounds(composition, vehicles, stops),
      cost,
      settings,
    });
    const lines = await routeLinesOf(
      this.geometry,
      departure.point,
      tours,
      (id) => stops.get(id)?.point,
    );
    const reference = (orderId: string): string => stops.get(orderId)?.reference ?? "";
    const late = placementLateOrders({ depotId: DEPOT_ID, cost, settings }, tours);
    return {
      day: composition.day,
      rounds: tours.map((tour, index) =>
        timedRoundView(tour, reference, lines[index] ?? null, late),
      ),
    };
  }

  /** Situe les arrêts — carnet, puis cache ; jamais le réseau. */
  private async locate(orderIds: readonly string[]): Promise<ReadonlyMap<string, LocatedStop>> {
    const points = await this.orders.stopPointsOf(orderIds);
    const located = await locateFromCache(points, this.cache, this.clock.now());
    return new Map(located.map((stop) => [stop.orderId, stop]));
  }
}

/** La composition reçue, sous la forme que le domaine chronomètre. */
function composedRounds(
  composition: TimeDeliveryRoundsQuery["composition"],
  vehicles: readonly PlanningVehicle[],
  stops: ReadonlyMap<string, LocatedStop>,
): readonly ComposedRound[] {
  const vehicleOf = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  return composition.rounds.map((round) => {
    const vehicle = vehicleOf.get(round.vehicleId);
    if (vehicle === undefined) {
      // `chosenVehicles` a déjà refusé un véhicule inconnu : ceci ne se voit qu'en cas de bogue.
      throw new RoutingVehicleNotFoundError(round.vehicleId);
    }
    return {
      roundId: round.roundId,
      vehicle,
      stops: round.orderIds.map((id) => routingStopFor(id, stops)),
    };
  });
}

function pointsOf(
  depot: GeoPoint,
  orderIds: readonly string[],
  stops: ReadonlyMap<string, LocatedStop>,
): ReadonlyMap<string, GeoPoint> {
  const points = new Map<string, GeoPoint>([[DEPOT_ID, depot]]);
  for (const orderId of orderIds) {
    const point = stops.get(orderId)?.point;
    if (point != null) {
      points.set(orderId, point);
    }
  }
  return points;
}

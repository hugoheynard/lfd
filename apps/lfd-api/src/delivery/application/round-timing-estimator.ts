import { Injectable, Logger } from "@nestjs/common";

import { Clock } from "../../platform/time/clock.js";
import { DeliveryOrdersReader, DepartureCandidatesReader } from "../channels/commerce/index.js";
import {
  DepartureNotLocatedError,
  RoadRoutingUnavailableError,
} from "../domain/errors/delivery-routing-errors.js";
import { DepartureReader } from "../domain/ports/departure.reader.js";
import type { CostFn } from "../domain/ports/distance-matrix.js";
import { DistanceMatrix } from "../domain/ports/distance-matrix.js";
import { FleetReader } from "../domain/ports/fleet.reader.js";
import { GeocodeCacheReader } from "../domain/ports/geocode-cache.reader.js";
import { RoutingSettingsReader } from "../domain/ports/routing-settings.reader.js";
import type { ProposedComposition } from "../domain/services/apply-proposal.js";
import { type ComposedRound, timeComposition } from "../domain/services/time-composition.js";
import type { GeoPoint } from "../domain/value-objects/geo-point.js";
import type { PlannedTiming } from "../domain/value-objects/planned-timing.js";
import type { RoutingSettings } from "../domain/value-objects/routing-settings.js";
import {
  locatedDeparture,
  locateFromCache,
  type LocatedStop,
  routingSettingsOf,
  routingStopFor,
} from "./delivery-routing-support.js";
import { plannedTimingOf } from "./planned-timing-of.js";

const logger = new Logger("RoundTimingEstimator");

/** L'identifiant du départ dans la matrice : aucun identifiant de commande ne le porte. */
const DEPOT_ID = "depot";

/** Une tournée qu'on sait chronométrer, et son rang dans la composition reçue. */
interface Timeable {
  readonly index: number;
  readonly round: ComposedRound;
}

/**
 * **L'horaire prévu des tournées qu'on applique** (décision Hugo 2026-10-06,
 * I10) — le serveur le tient de SA source : la composition appliquée est
 * rechronométrée comme « Chronométrer » le fait (`timeComposition`, par la
 * route, dans l'ordre reçu), jamais recopiée des chiffres de l'écran.
 *
 * Une prévision, pas une condition : une tournée vide, un arrêt non situé, un
 * véhicule inconnu rendent `null` pour CETTE tournée (les autres passages du
 * véhicule se chronomètrent sans elle) ; un calcul routier muet ou un départ
 * non situé rendent `null` pour toutes, et le disent au journal technique.
 * « Appliquer » ne se refuse jamais pour ça.
 */
@Injectable()
export class RoundTimingEstimator {
  constructor(
    private readonly settings: RoutingSettingsReader,
    private readonly departure: DepartureReader,
    private readonly candidates: DepartureCandidatesReader,
    private readonly fleet: FleetReader,
    private readonly orders: DeliveryOrdersReader,
    private readonly cache: GeocodeCacheReader,
    private readonly matrix: DistanceMatrix,
    private readonly clock: Clock,
  ) {}

  /** Au même rang que `rounds` ; `null` : pas d'horaire prévu pour cette tournée. */
  async timingsOf(
    day: string,
    rounds: readonly ProposedComposition[],
  ): Promise<readonly (PlannedTiming | null)[]> {
    const timings: (PlannedTiming | null)[] = rounds.map(() => null);
    const stops = await this.locate(rounds.flatMap((round) => round.orderIds));
    const timeable = await this.timeableOf(rounds, stops);
    if (timeable.length === 0) {
      return timings;
    }
    const routing = await this.routing(timeable, stops);
    if (routing === null) {
      return timings;
    }
    const tours = timeComposition({
      depotId: DEPOT_ID,
      rounds: timeable.map(({ round }) => round),
      cost: routing.cost,
      settings: routing.settings,
    });
    tours.forEach((tour, position) => {
      const index = timeable[position]?.index;
      if (index !== undefined) {
        timings[index] = plannedTimingOf(day, tour.timed);
      }
    });
    return timings;
  }

  /** Non vide, chaque arrêt situé, véhicule connu — sinon on ne prévoit rien. */
  private async timeableOf(
    rounds: readonly ProposedComposition[],
    stops: ReadonlyMap<string, LocatedStop>,
  ): Promise<readonly Timeable[]> {
    const vehicles = new Map((await this.fleet.list()).map((v) => [v.id, v]));
    return rounds.flatMap((item, index) => {
      const vehicle = vehicles.get(item.vehicleId);
      const located = item.orderIds.every((id) => (stops.get(id)?.point ?? null) !== null);
      if (vehicle === undefined || item.orderIds.length === 0 || !located) {
        return [];
      }
      const round: ComposedRound = {
        roundId: item.roundId,
        vehicle: { id: vehicle.id, name: vehicle.name },
        stops: item.orderIds.map((id) => routingStopFor(id, stops)),
      };
      return [{ index, round }];
    });
  }

  /** La matrice et les réglages ; `null` (et dit) si la route ne répond pas. */
  private async routing(
    timeable: readonly Timeable[],
    stops: ReadonlyMap<string, LocatedStop>,
  ): Promise<{ readonly cost: CostFn; readonly settings: RoutingSettings } | null> {
    try {
      const departure = await locatedDeparture(this.departure, this.candidates);
      const { settings } = await routingSettingsOf(this.settings);
      const points = new Map<string, GeoPoint>([[DEPOT_ID, departure.point]]);
      for (const { round } of timeable) {
        for (const stop of round.stops) {
          const point = stops.get(stop.id)?.point;
          if (point != null) {
            points.set(stop.id, point);
          }
        }
      }
      return { cost: await this.matrix.build(points), settings };
    } catch (error: unknown) {
      if (
        error instanceof RoadRoutingUnavailableError ||
        error instanceof DepartureNotLocatedError
      ) {
        logger.warn(`Tournées appliquées sans horaire prévu : ${error.message}`);
        return null;
      }
      throw error;
    }
  }

  /** Situe les arrêts — carnet, puis cache ; jamais le réseau. */
  private async locate(orderIds: readonly string[]): Promise<ReadonlyMap<string, LocatedStop>> {
    if (orderIds.length === 0) {
      return new Map();
    }
    const points = await this.orders.stopPointsOf(orderIds);
    const located = await locateFromCache(points, this.cache, this.clock.now());
    return new Map(located.map((stop) => [stop.orderId, stop]));
  }
}

import { Injectable, Logger } from "@nestjs/common";

import { Clock } from "../../platform/time/clock.js";
import {
  DeliveryOrdersReader,
  DepartureCandidatesReader,
  type TransferSiteFacts,
} from "../channels/commerce/index.js";
import { orderIdsOf } from "../domain/entities/delivery-round-state.js";
import { activeOnDay } from "../domain/entities/vehicle.js";
import {
  DepartureNotLocatedError,
  RoadRoutingUnavailableError,
} from "../domain/errors/delivery-routing-errors.js";
import { DeliveryRoundsReader, type RoundRow } from "../domain/ports/delivery-rounds.reader.js";
import { DepartureReader } from "../domain/ports/departure.reader.js";
import { DistanceMatrix } from "../domain/ports/distance-matrix.js";
import { GeocodeCacheReader } from "../domain/ports/geocode-cache.reader.js";
import { RoutingSettingsReader } from "../domain/ports/routing-settings.reader.js";
import {
  cheapestTransferInsertion,
  type PlannedSpan,
} from "../domain/services/place-transfer-stop.js";
import type { RoutingStop } from "../domain/services/route-timing.js";
import { compositionClockOf } from "../domain/services/time-composition.js";
import { minutesOfDay } from "../domain/value-objects/clock-time.js";
import { type GeoPoint, geoPoint } from "../domain/value-objects/geo-point.js";
import {
  locatedDeparture,
  locateFromCache,
  type LocatedStop,
  routingSettingsOf,
  routingStopFor,
} from "./delivery-routing-support.js";
import { parisSecondsOf } from "./planned-timing-of.js";
import { type TransferPlace, TransferPlaceFinder } from "./transfer-placer.js";

const logger = new Logger("TransferRouting");

/** L'identifiant du départ dans la matrice : aucune commande ne le porte. */
const DEPOT_ID = "depot";
/** L'identifiant du site dans la matrice. */
const SITE_ID = "transfer-site";
const SECONDS_PER_MINUTE = 60;

/**
 * **Où le transfert d'un site entre-t-il dans les tournées du jour ?** (plan
 * du transfert interne, §5, mode intégré, lot T1) — la lecture que la
 * composition fait avant d'écrire : les tournées au dépôt, leurs arrêts situés,
 * le point du site, la matrice routière, puis le calcul pur
 * (`cheapestTransferInsertion`).
 *
 * Une tournée n'est candidate que si elle est au dépôt, sur un véhicule actif
 * ce jour-là, et que TOUS les passages de son véhicule se chronomètrent :
 * arrêts situés, aucun autre transfert — le calcul ne connaît pas encore le
 * point d'un autre site (un seul site servi par transfert aujourd'hui —
 * limite écrite au plan). Un second passage ne part qu'au retour du premier,
 * et c'est à cette heure-là que son arrivée au site est jugée (2026-10-14).
 *
 * `null` : aucune place à temps, ou le calcul routier / le départ manquent —
 * dit au journal technique ; la composition replie alors sur une tournée
 * dédiée (Q-T9). Lecture seule, hors transaction : elle appelle le réseau.
 */
@Injectable()
export class TransferRouting extends TransferPlaceFinder {
  constructor(
    private readonly rounds: DeliveryRoundsReader,
    private readonly orders: DeliveryOrdersReader,
    private readonly cache: GeocodeCacheReader,
    private readonly departure: DepartureReader,
    private readonly candidates: DepartureCandidatesReader,
    private readonly settings: RoutingSettingsReader,
    private readonly matrix: DistanceMatrix,
    private readonly clock: Clock,
  ) {
    super();
  }

  async placeFor(day: string, site: TransferSiteFacts): Promise<TransferPlace | null> {
    if (site.gps === null) {
      return null;
    }
    const rounds = (await this.rounds.roundsOn(day)).filter((round) =>
      activeOnDay(round.vehicleRetiredAt, day),
    );
    if (!rounds.some(candidate)) {
      return null;
    }
    const stops = await this.locate(rounds.flatMap((round) => orderIdsOf(round.stops)));
    const located = timeableVehicles(rounds, stops);
    try {
      return await this.cheapest(day, located, stops, site, geoPoint(site.gps.lat, site.gps.lng));
    } catch (error: unknown) {
      if (
        error instanceof RoadRoutingUnavailableError ||
        error instanceof DepartureNotLocatedError
      ) {
        logger.warn(`Transfert vers « ${site.label} » le ${day}, non intégré : ${error.message}`);
        return null;
      }
      throw error;
    }
  }

  private async cheapest(
    day: string,
    rounds: readonly RoundRow[],
    stops: ReadonlyMap<string, LocatedStop>,
    site: TransferSiteFacts,
    sitePoint: GeoPoint,
  ): Promise<TransferPlace | null> {
    if (!rounds.some(candidate)) {
      return null;
    }
    const departure = await locatedDeparture(this.departure, this.candidates);
    const { settings } = await routingSettingsOf(this.settings);
    const points = new Map<string, GeoPoint>([
      [DEPOT_ID, departure.point],
      [SITE_ID, sitePoint],
    ]);
    for (const [orderId, stop] of stops) {
      if (stop.point !== null) {
        points.set(orderId, stop.point);
      }
    }
    const insertion = cheapestTransferInsertion({
      depotId: DEPOT_ID,
      cost: await this.matrix.build(points),
      clock: compositionClockOf(settings),
      transfer: transferStopOf(site),
      rounds: rounds.map((round) => ({
        roundId: round.id,
        vehicleId: round.vehicleId,
        passage: round.passage,
        open: candidate(round),
        planned: plannedSpanOf(day, round),
        stops: orderIdsOf(round.stops).map((orderId) => routingStopFor(orderId, stops)),
      })),
    });
    const version = rounds.find((round) => round.id === insertion?.roundId)?.version;
    return insertion === null || version === undefined ? null : { ...insertion, version };
  }

  /** Situe les arrêts — carnet, puis cache ; jamais le géocodeur. */
  private async locate(orderIds: readonly string[]): Promise<ReadonlyMap<string, LocatedStop>> {
    if (orderIds.length === 0) {
      return new Map();
    }
    const points = await this.orders.stopPointsOf(orderIds);
    const located = await locateFromCache(points, this.cache, this.clock.now());
    return new Map(located.map((stop) => [stop.orderId, stop]));
  }
}

/** L'horaire prévu d'une tournée, en secondes depuis minuit du jour ; `null` : aucun. */
function plannedSpanOf(day: string, round: RoundRow): PlannedSpan | null {
  if (round.planned === null) {
    return null;
  }
  const departure = parisSecondsOf(day, round.planned.departureAt);
  const back = parisSecondsOf(day, round.planned.returnAt);
  return departure === null || back === null ? null : { departure, return: back };
}

/** Une place possible : au dépôt, au moins un arrêt (un véhicule actif, filtré avant). */
function candidate(round: RoundRow): boolean {
  return round.departedAt === null && round.stops.length > 0;
}

/**
 * Les tournées des véhicules qu'on sait chronométrer d'un bout à l'autre :
 * chaque passage n'a que des arrêts de commande, tous situés. Un passage
 * qu'on ne sait pas chronométrer — un arrêt sans point, ou le transfert d'un
 * autre site, dont le point n'est pas dans la matrice — rend son véhicule
 * inchronométrable : ses autres passages en dépendent (2026-10-14).
 */
function timeableVehicles(
  rounds: readonly RoundRow[],
  stops: ReadonlyMap<string, LocatedStop>,
): readonly RoundRow[] {
  const timeable = (round: RoundRow): boolean =>
    round.stops.every(
      (stop) => stop.kind === "order" && (stops.get(stop.orderId)?.point ?? null) !== null,
    );
  const blocked = new Set(
    rounds.filter((round) => !timeable(round)).map((round) => round.vehicleId),
  );
  return rounds.filter((round) => !blocked.has(round.vehicleId));
}

/**
 * L'arrêt du transfert pour le calcul : le site, « arrivé avant » l'heure
 * requise (§7) ; sans heure calculable, sans fenêtre. Le temps sur place est
 * le réglage global : le site n'a pas encore de durée de déchargement (écart
 * au plan, §5, signalé).
 */
function transferStopOf(site: TransferSiteFacts): RoutingStop {
  const arrival = site.arrivalBy === null ? null : minutesOfDay(site.arrivalBy);
  return {
    id: SITE_ID,
    window: arrival === null ? null : { start: null, end: arrival * SECONDS_PER_MINUTE },
  };
}

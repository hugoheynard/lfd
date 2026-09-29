import type { DeliverySimulationView, SimulatedStop } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DepartureCandidatesReader } from "../../channels/commerce/index.js";
import { UnknownCostPointError } from "../../domain/errors/delivery-routing-errors.js";
import { DepartureReader } from "../../domain/ports/departure.reader.js";
import { DistanceMatrix } from "../../domain/ports/distance-matrix.js";
import type { PlanningVehicle, ProposedTour } from "../../domain/services/proposal.js";
import { type PlannableStop, proposeRounds } from "../../domain/services/propose-rounds.js";
import { type GeoPoint, geoPoint } from "../../domain/value-objects/geo-point.js";
import { RoutingSettings } from "../../domain/value-objects/routing-settings.js";
import { passageLimitsOf } from "../delivery-proposal-support.js";
import { ROAD_ESTIMATE, stopTimesView, tourTimesView } from "../delivery-proposal-view.js";
import {
  locatedDeparture,
  timeWindowOf,
  withDeprecatedFields,
} from "../delivery-routing-support.js";
import { SimulateDeliveryRoundsQuery } from "./simulate-delivery-rounds.query.js";

const SECONDS_PER_MINUTE = 60;
/** L'identifiant du départ dans la matrice. */
const DEPOT_ID = "depot";
/** Le libellé d'un départ saisi dans le scénario, qui n'est aucun point de retrait. */
const TYPED_DEPARTURE_LABEL = "Point de départ saisi";

/** Un arrêt du scénario, sous un identifiant INTERNE : ceux de l'écran peuvent se répéter. */
interface ScenarioStop {
  readonly internalId: string;
  readonly stop: SimulatedStop;
  readonly point: GeoPoint;
}

/**
 * **Le simulateur** (L9-C1 à C5) : `proposeRounds` en tournées neuves, sur la
 * `DistanceMatrix` injectée — la route, ou un refus : plus de vol d'oiseau
 * (L10b-C5). Les véhicules sont des noms (L9-C3) ; les réglages passent par le
 * value object et en subissent les refus (L9-C4). Rien n'est lu du jour, rien
 * n'est écrit.
 *
 * @throws {InvalidRoutingSettingError} @throws {InvalidGeoPointError}
 * @throws {DepartureNotLocatedError} aucun départ saisi, et aucun point réglé situé.
 * @throws {RoadRoutingUnavailableError} le calcul routier ne répond pas.
 */
@QueryHandler(SimulateDeliveryRoundsQuery)
export class SimulateDeliveryRoundsHandler implements IQueryHandler<
  SimulateDeliveryRoundsQuery,
  DeliverySimulationView
> {
  constructor(
    private readonly departure: DepartureReader,
    private readonly candidates: DepartureCandidatesReader,
    private readonly matrix: DistanceMatrix,
  ) {}

  async execute({ scenario }: SimulateDeliveryRoundsQuery): Promise<DeliverySimulationView> {
    const settings = RoutingSettings.define({
      ...withDeprecatedFields(scenario.settings, RoutingSettings.DEFAULTS),
      defaultMode: "new_rounds",
    });
    const departure = await this.departureOf(scenario.departure);
    const stops = scenario.stops.map((stop, index) => ({
      internalId: `stop-${index}`,
      stop,
      point: geoPoint(stop.gps.lat, stop.gps.lng),
    }));
    const byId = new Map(stops.map((entry) => [entry.internalId, entry]));
    const vehicles: readonly PlanningVehicle[] = scenario.vehicles.map((name, index) => ({
      id: `v${index + 1}`,
      name,
    }));
    const points = new Map<string, GeoPoint>([
      [DEPOT_ID, departure.point],
      ...stops.map((entry): [string, GeoPoint] => [entry.internalId, entry.point]),
    ]);
    const cost = await this.matrix.build(points);
    const proposal = proposeRounds({
      depotId: DEPOT_ID,
      stops: stops.map(plannableOf),
      vehicles,
      recomposable: [],
      cost,
      settings,
      passageLimits: passageLimitsOf(settings.multiplePassages, vehicles, []),
    });
    return {
      estimate: ROAD_ESTIMATE,
      departure: { label: departure.label, lat: departure.point.lat, lng: departure.point.lng },
      rounds: proposal.tours.map((tour) => simulatedRoundOf(tour, byId)),
      overflow: proposal.overflow.map((id) => {
        const { stop } = entryOf(byId, id);
        return { stopId: stop.id, label: stop.label };
      }),
    };
  }

  /** Le départ saisi, sinon le point réglé au lot 2. */
  private async departureOf(
    typed: { readonly lat: number; readonly lng: number } | null,
  ): Promise<{ readonly label: string; readonly point: GeoPoint }> {
    if (typed !== null) {
      return { label: TYPED_DEPARTURE_LABEL, point: geoPoint(typed.lat, typed.lng) };
    }
    const configured = await locatedDeparture(this.departure, this.candidates);
    return { label: configured.label, point: configured.point };
  }
}

/** Un identifiant rendu par le calcul est toujours un des nôtres ; sinon, c'est un bogue. */
function entryOf(byId: ReadonlyMap<string, ScenarioStop>, id: string): ScenarioStop {
  const entry = byId.get(id);
  if (entry === undefined) {
    throw new UnknownCostPointError(id);
  }
  return entry;
}

/** Le temps sur place de l'arrêt compte quand il est donné (L9-C8) ; sinon le réglage. */
function plannableOf(entry: ScenarioStop): PlannableStop {
  const base = { id: entry.internalId, window: timeWindowOf(entry.stop.window), homeRoundId: null };
  return entry.stop.stopMinutes === undefined
    ? base
    : { ...base, stopSeconds: entry.stop.stopMinutes * SECONDS_PER_MINUTE };
}

function simulatedRoundOf(
  tour: ProposedTour,
  byId: ReadonlyMap<string, ScenarioStop>,
): DeliverySimulationView["rounds"][number] {
  return {
    vehicleName: tour.vehicleName,
    ...tourTimesView(tour),
    stops: tour.stops.map((placed, index) => {
      const { stop } = entryOf(byId, placed.id);
      return { stopId: stop.id, label: stop.label, ...stopTimesView(tour, index) };
    }),
  };
}

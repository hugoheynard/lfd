import type { DeliveryPlacementSuggestionsView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import {
  DeliveryOrdersReader,
  DeliveryOrderStatesReader,
  DepartureCandidatesReader,
} from "../../channels/commerce/index.js";
import type { RoundRow } from "../../domain/ports/delivery-rounds.reader.js";
import { BroughtBackOrdersReader } from "../../domain/ports/brought-back-orders.reader.js";
import { DeliveryRoundsReader } from "../../domain/ports/delivery-rounds.reader.js";
import { DepartureReader } from "../../domain/ports/departure.reader.js";
import { DistanceMatrix } from "../../domain/ports/distance-matrix.js";
import { FleetReader } from "../../domain/ports/fleet.reader.js";
import { GeocodeCacheReader } from "../../domain/ports/geocode-cache.reader.js";
import { LoadedStopsReader } from "../../domain/ports/loaded-stops.reader.js";
import { RoutingSettingsReader } from "../../domain/ports/routing-settings.reader.js";
import {
  type PlacementSuggestion,
  suggestPlacements,
} from "../../domain/services/suggest-placements.js";
import { busyStarts } from "../../domain/services/vehicle-availability.js";
import {
  type ChosenVehicle,
  chosenVehicles,
  insertableRounds,
  type KeptRound,
} from "../delivery-proposal-support.js";
import {
  locateProposalDay,
  type ProposalDayReading,
  readProposalDay,
} from "../delivery-proposal-day.js";
import { DEPOT_ID, pointsOf, poolOf } from "../delivery-proposal-pool.js";
import { placementSuggestionsViewOf } from "../delivery-placement-suggestions-view.js";
import {
  locatedDeparture,
  type LocatedStop,
  routingSettingsOf,
  routingStopFor,
} from "../delivery-routing-support.js";
import { fleetOccupationOf } from "../delivery-vehicle-availability.js";
import { ProposalCapacity } from "../proposal-capacity.js";
import { compositionZonesOf } from "../proposal-zones.js";
import { GetDeliveryPlacementSuggestionsQuery } from "./get-delivery-placement-suggestions.query.js";

/**
 * **La place suggérée** (CA7, `composition-automatique.md` §5) — pour chaque
 * commande à répartir d'un jour qui a des tournées enregistrées, l'insertion
 * la moins chère dans une tournée au dépôt, chargée ou non (2026-10-07)
 * (`suggestPlacements`), avec la capacité (CA4, contenant par défaut), les
 * zones et les échéances. Rien n'est réordonné ; « Placer ici » est le geste
 * d'affectation existant, au rang suggéré, sous la version rendue ici.
 *
 * Les MÊMES lectures que « Insérer » (`GetDeliveryRoundProposalHandler`) :
 * le jour (`readProposalDay`), les points (`locateProposalDay`), la place
 * (`ProposalCapacity`), les zones, l'occupation des camionnettes, une seule
 * matrice. Sans tournée ou sans commande à répartir, elle rend vide et ne
 * construit aucune matrice : l'écran l'appelle à chaque lecture du jour.
 *
 * @throws {DepartureNotLocatedError} @throws {NoVehicleForProposalError}
 * @throws {RoadRoutingUnavailableError} le calcul routier ne répond pas.
 */
@QueryHandler(GetDeliveryPlacementSuggestionsQuery)
export class GetDeliveryPlacementSuggestionsHandler implements IQueryHandler<
  GetDeliveryPlacementSuggestionsQuery,
  DeliveryPlacementSuggestionsView
> {
  constructor(
    private readonly settings: RoutingSettingsReader,
    private readonly departure: DepartureReader,
    private readonly candidates: DepartureCandidatesReader,
    private readonly fleet: FleetReader,
    private readonly rounds: DeliveryRoundsReader,
    private readonly orders: DeliveryOrdersReader,
    private readonly loadedStops: LoadedStopsReader,
    private readonly cache: GeocodeCacheReader,
    private readonly matrix: DistanceMatrix,
    private readonly clock: Clock,
    private readonly broughtBack: BroughtBackOrdersReader,
    private readonly states: DeliveryOrderStatesReader,
    private readonly place: ProposalCapacity,
  ) {}

  async execute(
    query: GetDeliveryPlacementSuggestionsQuery,
  ): Promise<DeliveryPlacementSuggestionsView> {
    const day = await readProposalDay(
      {
        ...{ rounds: this.rounds, orders: this.orders, loadedStops: this.loadedStops },
        ...{ broughtBack: this.broughtBack, states: this.states },
      },
      query.day,
    );
    if (day.rounds.length === 0 || day.unassigned.length === 0) {
      return { day: query.day, suggestions: [] };
    }
    const stops = await locateProposalDay(
      { orders: this.orders, cache: this.cache },
      day,
      this.clock.now(),
    );
    const vehicles = await chosenVehicles(this.fleet, query.day, null);
    const suggestions = await this.suggest(day, stops, vehicles);
    return placementSuggestionsViewOf({
      ...{ day: query.day, unassigned: day.unassigned, rounds: day.rounds },
      ...{ stops, suggestions },
    });
  }

  /** Le calcul, sur les tournées où l'on peut encore poser un arrêt. */
  private async suggest(
    day: ProposalDayReading,
    stops: ReadonlyMap<string, LocatedStop>,
    vehicles: readonly ChosenVehicle[],
  ): Promise<readonly PlacementSuggestion[]> {
    const { open, kept } = openRoundsOf(day, stops, vehicles);
    const pool = poolOf(day.unassigned, [], stops);
    if (pool.length === 0) {
      return [];
    }
    if (open.length === 0) {
      return pool.map((stop) => ({ kind: "none", orderId: stop.id, reason: "no_round" }));
    }
    const { settings } = await routingSettingsOf(this.settings);
    const departure = await locatedDeparture(this.departure, this.candidates);
    const occupation = fleetOccupationOf(kept, stops);
    const roundStops = [
      ...open.flatMap((round) => round.stops.map((stop) => stop.orderId)),
      ...occupation.busy.flatMap((round) => round.stops.map((stop) => stop.id)),
    ];
    const considered = [...day.unassigned, ...roundStops];
    const [capacity, cost] = await Promise.all([
      this.place.of(considered, settings.defaultContainer),
      this.matrix.build(
        pointsOf(departure.point, [...pool.map((stop) => stop.id), ...roundStops], stops),
      ),
    ]);
    return suggestPlacements({
      ...{ depotId: DEPOT_ID, cost, settings, stops: pool },
      vehicles: vehicles.filter((vehicle) => !occupation.unknownReturn.has(vehicle.id)),
      rounds: open.map((round) => ({
        ...{ roundId: round.id, vehicleId: round.vehicleId, vehicleName: round.vehicleName },
        passage: round.passage,
        stops: round.stops.map((stop) => routingStopFor(stop.orderId, stops)),
      })),
      starts: busyStarts({ depotId: DEPOT_ID, cost, settings }, occupation.busy),
      capacity: capacity.capacity,
      zones: compositionZonesOf(vehicles, stops),
    });
  }
}

/**
 * Les tournées où une place peut être suggérée : celles d'« Insérer » (au
 * dépôt, chaque arrêt situé), **chargées comprises** — une tournée reçoit
 * jusqu'à son départ, et c'est la place du véhicule qui limite (Hugo,
 * 2026-10-07, `documentation/livraisons/inserer-avant-le-depart.md`).
 * L'arrêt posé n'a pas de bac : « Partir » le refusera tant qu'il n'est pas
 * chargé.
 */
function openRoundsOf(
  day: ProposalDayReading,
  stops: ReadonlyMap<string, LocatedStop>,
  vehicles: readonly ChosenVehicle[],
): {
  readonly open: readonly RoundRow[];
  readonly kept: readonly KeptRound[];
} {
  const { insertable, kept } = insertableRounds({
    rounds: day.rounds,
    vehicleIds: new Set(vehicles.map((vehicle) => vehicle.id)),
    located: stops,
  });
  return { open: insertable, kept };
}

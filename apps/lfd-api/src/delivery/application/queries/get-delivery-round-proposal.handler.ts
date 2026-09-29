import type { DeliveryRoundProposalView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import {
  type DeliveryOrderFacts,
  DeliveryOrdersReader,
  DepartureCandidatesReader,
} from "../../channels/commerce/index.js";
import type { RoundRow } from "../../domain/ports/delivery-rounds.reader.js";
import { DeliveryRoundsReader } from "../../domain/ports/delivery-rounds.reader.js";
import { DepartureReader } from "../../domain/ports/departure.reader.js";
import { DistanceMatrix } from "../../domain/ports/distance-matrix.js";
import { FleetReader } from "../../domain/ports/fleet.reader.js";
import { GeocodeCacheReader } from "../../domain/ports/geocode-cache.reader.js";
import { LoadedStopsReader } from "../../domain/ports/loaded-stops.reader.js";
import { RoutingSettingsReader } from "../../domain/ports/routing-settings.reader.js";
import type { CostFn } from "../../domain/ports/distance-matrix.js";
import { RouteGeometry } from "../../domain/ports/route-geometry.js";
import { insertIntoRounds } from "../../domain/services/insert-into-rounds.js";
import type { PlanningVehicle, Proposal } from "../../domain/services/proposal.js";
import { type PlannableStop, proposeRounds } from "../../domain/services/propose-rounds.js";
import { busyStarts } from "../../domain/services/vehicle-availability.js";
import type { VehicleStart } from "../../domain/services/vehicle-plan.js";
import type { RoutingSettings } from "../../domain/value-objects/routing-settings.js";
import type { GeoPoint } from "../../domain/value-objects/geo-point.js";
import {
  chosenVehicles,
  classifyRounds,
  insertableRounds,
  type KeptRound,
  passageLimitsOf,
} from "../delivery-proposal-support.js";
import { proposalViewOf } from "../delivery-proposal-view.js";
import { routeLinesOf } from "../delivery-route-lines.js";
import { fleetOccupationOf } from "../delivery-vehicle-availability.js";
import {
  type LocatedDeparture,
  locatedDeparture,
  locateFromCache,
  type LocatedStop,
  routingSettingsOf,
  routingStopFor,
  routingStopOf,
} from "../delivery-routing-support.js";
import { GetDeliveryRoundProposalQuery } from "./get-delivery-round-proposal.query.js";

/** L'identifiant du départ dans la matrice : aucun identifiant de commande ne le porte. */
const DEPOT_ID = "depot";

/** Ce que les deux modes partagent. */
interface PlanInputs {
  readonly day: DayReading;
  readonly stops: ReadonlyMap<string, LocatedStop>;
  readonly vehicles: readonly PlanningVehicle[];
  readonly departure: LocatedDeparture;
  readonly settings: RoutingSettings;
}

/** Une proposition calculée, et les tournées qu'elle ne touche pas. */
interface Planned {
  readonly proposal: Proposal;
  readonly kept: readonly KeptRound[];
}

/** Ce que la proposition a lu du jour. */
interface DayReading {
  readonly rounds: readonly RoundRow[];
  /** À répartir : attendues ce jour, non annulées, dans aucune tournée vivante. */
  readonly unassigned: readonly string[];
  readonly loadedStopIds: ReadonlySet<string>;
  /** Les commandes composées, relues par leur id : de quoi voir un arrêt signalé. */
  readonly facts: ReadonlyMap<string, DeliveryOrderFacts>;
}

/**
 * **Proposer** (L7-C3 à C6, C12, C15) — ne lit que le cache du géocodage et
 * le carnet, jamais le réseau ; n'écrit rien. Par défaut, elle ne place que
 * les commandes à répartir ; « tout recomposer » y ajoute les tournées non
 * parties, sans sac chargé, sans arrêt signalé ni non situé. Elle rend les
 * versions de toutes les tournées lues : l'application les exigera.
 *
 * Une camionnette qui porte une tournée chargée ou partie n'est libre qu'à
 * son retour estimé (L7t-C2) ; si un arrêt de cette tournée n'est pas situé,
 * elle ne reçoit rien (`fleetOccupationOf`).
 *
 * @throws {DepartureNotLocatedError} @throws {NoVehicleForProposalError}
 * @throws {RoutingVehicleNotFoundError} @throws {VehicleInactiveOnDayError}
 * @throws {RoadRoutingUnavailableError} le calcul routier ne répond pas (L10b-C5).
 */
@QueryHandler(GetDeliveryRoundProposalQuery)
export class GetDeliveryRoundProposalHandler implements IQueryHandler<
  GetDeliveryRoundProposalQuery,
  DeliveryRoundProposalView
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
    private readonly geometry: RouteGeometry,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetDeliveryRoundProposalQuery): Promise<DeliveryRoundProposalView> {
    const { settings, source } = await routingSettingsOf(this.settings);
    const departure = await locatedDeparture(this.departure, this.candidates);
    const vehicles = await chosenVehicles(this.fleet, query.day, query.vehicleIds);
    const day = await this.readDay(query.day);
    const stops = await this.locate(day);
    const mode = query.recomposeAll ? "new_rounds" : (query.mode ?? settings.defaultMode);
    const planned =
      mode === "insert" && !query.recomposeAll
        ? await this.planInsertion({ day, stops, vehicles, departure, settings })
        : await this.planNewRounds(query, { day, stops, vehicles, departure, settings });
    const unlocated = day.unassigned.flatMap((id) => {
      const stop = stops.get(id);
      return stop !== undefined && stop.point === null ? [stop] : [];
    });
    const lines = await routeLinesOf(
      this.geometry,
      departure.point,
      planned.proposal.tours,
      (id) => stops.get(id)?.point,
    );
    return proposalViewOf({
      ...{ day: query.day, mode, departure, settings: { ...settings.values(), source } },
      ...{ proposal: planned.proposal, rounds: day.rounds, kept: planned.kept, stops, unlocated },
      lines,
    });
  }

  /** `new_rounds`, et « tout recomposer » : tournées neuves, ou recomposables reprises. */
  private async planNewRounds(
    query: GetDeliveryRoundProposalQuery,
    ctx: PlanInputs,
  ): Promise<Planned> {
    const { recomposable, kept } = classifyRounds({
      day: query.day,
      rounds: ctx.day.rounds,
      loadedStopIds: ctx.day.loadedStopIds,
      facts: ctx.day.facts,
      located: ctx.stops,
      recomposeAll: query.recomposeAll,
    });
    const pool = poolOf(ctx.day.unassigned, recomposable, ctx.stops);
    const occupation = fleetOccupationOf(kept, ctx.stops);
    const cost = await this.costOf(ctx, [
      ...pool.map((stop) => stop.id),
      ...occupation.busy.flatMap((round) => round.stops.map((stop) => stop.id)),
    ]);
    const proposal = proposeRounds({
      depotId: DEPOT_ID,
      stops: pool,
      vehicles: ctx.vehicles.filter((vehicle) => !occupation.unknownReturn.has(vehicle.id)),
      recomposable: recomposable.map(({ id, vehicleId, vehicleName, passage }) => ({
        ...{ roundId: id, vehicleId, vehicleName, passage },
      })),
      cost,
      settings: ctx.settings,
      passageLimits: passageLimitsOf(
        ctx.settings.multiplePassages,
        ctx.vehicles,
        kept.map(({ round }) => round),
      ),
      starts: startsOf(ctx.settings, cost, occupation.busy),
    });
    return { proposal, kept };
  }

  /** `insert` : dans les tournées existantes, sans réordonner ce qui est placé à la main. */
  private async planInsertion(ctx: PlanInputs): Promise<Planned> {
    const { insertable, kept } = insertableRounds({
      rounds: ctx.day.rounds,
      vehicleIds: new Set(ctx.vehicles.map((vehicle) => vehicle.id)),
      located: ctx.stops,
    });
    const pool = poolOf(ctx.day.unassigned, [], ctx.stops);
    const occupation = fleetOccupationOf(kept, ctx.stops);
    const roundStops = [
      ...insertable.flatMap((round) => round.stops.map((stop) => stop.orderId)),
      ...occupation.busy.flatMap((round) => round.stops.map((stop) => stop.id)),
    ];
    const cost = await this.costOf(ctx, [...pool.map((stop) => stop.id), ...roundStops]);
    const proposal = insertIntoRounds({
      depotId: DEPOT_ID,
      stops: pool,
      vehicles: ctx.vehicles.filter((vehicle) => !occupation.unknownReturn.has(vehicle.id)),
      rounds: insertable.map((round) => ({
        ...{ roundId: round.id, vehicleId: round.vehicleId, vehicleName: round.vehicleName },
        passage: round.passage,
        stops: round.stops.map((stop) => routingStopFor(stop.orderId, ctx.stops)),
      })),
      cost,
      settings: ctx.settings,
      passageLimits: passageLimitsOf(ctx.settings.multiplePassages, ctx.vehicles, ctx.day.rounds),
      starts: startsOf(ctx.settings, cost, occupation.busy),
    });
    const touched = new Set(proposal.tours.map((tour) => tour.roundId));
    const unchanged = insertable
      .filter((round) => !touched.has(round.id))
      .map((round) => ({ round, reason: "unchanged" as const }));
    return { proposal, kept: [...kept, ...unchanged] };
  }

  private costOf(ctx: PlanInputs, orderIds: readonly string[]): Promise<CostFn> {
    return this.matrix.build(pointsOf(ctx.departure.point, orderIds, ctx.stops));
  }

  /** Situe les commandes à répartir et celles des tournées — carnet, puis cache. */
  private async locate(day: DayReading): Promise<ReadonlyMap<string, LocatedStop>> {
    const composedIds = day.rounds.flatMap((round) => round.stops.map((stop) => stop.orderId));
    const points = await this.orders.stopPointsOf([...day.unassigned, ...composedIds]);
    const located = await locateFromCache(points, this.cache, this.clock.now());
    return new Map(located.map((stop) => [stop.orderId, stop]));
  }

  private async readDay(serviceDay: string): Promise<DayReading> {
    const [rounds, expected] = await Promise.all([
      this.rounds.roundsOn(serviceDay),
      this.orders.expectedOn(serviceDay),
    ]);
    const active = expected.filter((order) => order.status === "active");
    const [assigned, loadedStopIds] = await Promise.all([
      this.rounds.composedAmong(active.map((order) => order.orderId)),
      this.loadedStops.loadedAmong(rounds.flatMap((round) => round.stops.map((s) => s.stopId))),
    ]);
    const unassigned = active
      .map((order) => order.orderId)
      .filter((orderId) => !assigned.has(orderId));
    const facts = await this.orders.byIds(
      rounds.flatMap((round) => round.stops.map((stop) => stop.orderId)),
    );
    return {
      rounds,
      unassigned,
      loadedStopIds,
      facts: new Map(facts.map((order) => [order.orderId, order])),
    };
  }
}

/** Les arrêts à placer : les commandes à répartir situées, puis ceux des tournées recomposables. */
function poolOf(
  unassigned: readonly string[],
  recomposable: readonly RoundRow[],
  stops: ReadonlyMap<string, LocatedStop>,
): readonly PlannableStop[] {
  const plannable = (orderId: string, homeRoundId: string | null): PlannableStop[] => {
    const stop = stops.get(orderId);
    return stop?.point == null ? [] : [{ ...routingStopOf(stop), homeRoundId }];
  };
  return [
    ...unassigned.flatMap((orderId) => plannable(orderId, null)),
    ...recomposable.flatMap((round) =>
      round.stops.flatMap((stop) => plannable(stop.orderId, round.id)),
    ),
  ];
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

/** D'où part chaque camionnette occupée par une tournée chargée ou partie (L7t-C2). */
function startsOf(
  settings: RoutingSettings,
  cost: CostFn,
  busy: Parameters<typeof busyStarts>[1],
): ReadonlyMap<string, VehicleStart> {
  return busyStarts({ depotId: DEPOT_ID, cost, settings }, busy);
}

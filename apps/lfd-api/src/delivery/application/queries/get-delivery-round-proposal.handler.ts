import type { DeliveryRoundProposalView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import {
  DeliveryOrdersReader,
  DeliveryOrderStatesReader,
  DepartureCandidatesReader,
} from "../../channels/commerce/index.js";
import { BroughtBackOrdersReader } from "../../domain/ports/brought-back-orders.reader.js";
import {
  ActiveBinTypesReader,
  MeasuredVehiclesReader,
} from "../../domain/ports/composition-prerequisites.readers.js";
import { DeliveryRoundsReader } from "../../domain/ports/delivery-rounds.reader.js";
import { DepartureReader } from "../../domain/ports/departure.reader.js";
import { DistanceMatrix } from "../../domain/ports/distance-matrix.js";
import { FleetReader } from "../../domain/ports/fleet.reader.js";
import { GeocodeCacheReader } from "../../domain/ports/geocode-cache.reader.js";
import { LoadedStopsReader } from "../../domain/ports/loaded-stops.reader.js";
import { RoutingSettingsReader } from "../../domain/ports/routing-settings.reader.js";
import type { CostFn } from "../../domain/ports/distance-matrix.js";
import { RouteGeometry } from "../../domain/ports/route-geometry.js";
import { ensureComposable } from "../../domain/services/composition-prerequisites.js";
import { insertIntoRounds } from "../../domain/services/insert-into-rounds.js";
import type { Proposal } from "../../domain/services/proposal.js";
import { proposeRounds } from "../../domain/services/propose-rounds.js";
import { busyStarts } from "../../domain/services/vehicle-availability.js";
import type { VehicleStart } from "../../domain/services/vehicle-plan.js";
import type { RoutingSettings } from "../../domain/value-objects/routing-settings.js";
import {
  type ChosenVehicle,
  chosenVehicles,
  classifyRounds,
  insertableRounds,
  type KeptRound,
  passageLimitsOf,
} from "../delivery-proposal-support.js";
import {
  locateProposalDay,
  type ProposalDayReading,
  readProposalDay,
} from "../delivery-proposal-day.js";
import { proposalViewOf } from "../delivery-proposal-view.js";
import { routeLinesOf } from "../delivery-route-lines.js";
import { fleetOccupationOf } from "../delivery-vehicle-availability.js";
import {
  type LocatedDeparture,
  locatedDeparture,
  type LocatedStop,
  routingSettingsOf,
  routingStopFor,
} from "../delivery-routing-support.js";
import {
  defaultDemandAmong,
  DEPOT_ID,
  pointsOf,
  poolOf,
  unknownDemandAmong,
} from "../delivery-proposal-pool.js";
import { ProposalCapacity, type ProposalCapacityReading } from "../proposal-capacity.js";
import { compositionZonesOf } from "../proposal-zones.js";
import { GetDeliveryRoundProposalQuery } from "./get-delivery-round-proposal.query.js";

/** Ce que les deux modes partagent. */
interface PlanInputs {
  readonly day: ProposalDayReading;
  readonly stops: ReadonlyMap<string, LocatedStop>;
  readonly vehicles: readonly ChosenVehicle[];
  readonly departure: LocatedDeparture;
  readonly settings: RoutingSettings;
  readonly capacity: ProposalCapacityReading;
}

/** Une proposition calculée, et les tournées qu'elle ne touche pas. */
interface Planned {
  readonly proposal: Proposal;
  readonly kept: readonly KeptRound[];
}

/**
 * **Proposer** (L7-C3 à C6, C12, C15) — ne lit que le cache du géocodage et
 * le carnet, jamais le réseau ; n'écrit rien. Par défaut, elle ne place que
 * les commandes à répartir — rapportées d'un autre jour comprises, en tête
 * (`decisions-par-defaut-2026-10-02.md`, § 4) ; « tout recomposer » y ajoute les tournées non
 * parties, sans bac chargé, sans arrêt signalé ni non situé. Elle rend les
 * versions de toutes les tournées lues : l'application les exigera.
 *
 * Une camionnette qui porte une tournée chargée ou partie n'est libre qu'à
 * son retour estimé (L7t-C2) ; si un arrêt de cette tournée n'est pas situé,
 * elle ne reçoit rien (`fleetOccupationOf`).
 *
 * **La place entre dans le calcul** (CA4) : chaque commande occupe ses bacs
 * déclarés, sinon ceux qu'estime le colisage ; une place qui ferait déborder
 * une caisse n'est pas prise. Une commande dont on ne sait pas les bacs est
 * placée SANS contrôle (2026-10-06) : elle n'occupe rien au calcul, la part
 * connue de sa tournée reste contrôlée — un minorant de la charge réelle,
 * donc un refus sûr — et la vue la nomme (`unknownDemand`) pour que l'écran
 * dise « place non vérifiée ». Le contenant par défaut des réglages
 * (2026-10-06) passe avant l'inconnu : la commande occupe alors ce défaut,
 * contrôlé comme le reste, et la vue la nomme (`defaultDemand`).
 *
 * **Les zones autorisées entrent dans le calcul** (2026-10-06) : une commande
 * n'est jamais essayée dans un véhicule restreint à d'autres zones ; sans
 * zone connue, elle va partout. Ce qu'aucun véhicule autorisé ne peut
 * prendre reste à répartir, raison `zone`.
 *
 * **Refusée sans socle** (CA-D3) : aucun véhicule en service avec ses cotes,
 * ou aucun type de bac en service — c'est le premier contrôle.
 *
 * @throws {NoMeasuredVehicleError} @throws {NoActiveBinTypeError}
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
    private readonly broughtBack: BroughtBackOrdersReader,
    private readonly states: DeliveryOrderStatesReader,
    private readonly measured: MeasuredVehiclesReader,
    private readonly binTypes: ActiveBinTypesReader,
    private readonly place: ProposalCapacity,
  ) {}

  async execute(query: GetDeliveryRoundProposalQuery): Promise<DeliveryRoundProposalView> {
    ensureComposable({
      measuredVehicleIds: await this.measured.measuredIds(),
      activeBinTypeIds: await this.binTypes.activeIds(),
    });
    const { settings, source } = await routingSettingsOf(this.settings);
    const departure = await locatedDeparture(this.departure, this.candidates);
    const vehicles = await chosenVehicles(this.fleet, query.day, query.vehicleIds);
    const day = await readProposalDay(
      {
        ...{ rounds: this.rounds, orders: this.orders, loadedStops: this.loadedStops },
        ...{ broughtBack: this.broughtBack, states: this.states },
      },
      query.day,
    );
    const stops = await locateProposalDay(
      { orders: this.orders, cache: this.cache },
      day,
      this.clock.now(),
    );
    const considered = [
      ...day.unassigned,
      ...day.rounds.flatMap((round) => round.stops.map((stop) => stop.orderId)),
    ];
    const capacity = await this.place.of(considered, settings.defaultContainer);
    const mode = query.recomposeAll ? "new_rounds" : (query.mode ?? settings.defaultMode);
    const inputs = { day, stops, vehicles, departure, settings, capacity };
    const planned =
      mode === "insert" && !query.recomposeAll
        ? await this.planInsertion(inputs)
        : await this.planNewRounds(query, inputs);
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
      unknownDemand: unknownDemandAmong(considered, capacity.unknown),
      defaultDemand: defaultDemandAmong(considered, capacity.defaulted),
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
      broughtBack: ctx.day.broughtBack,
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
      capacity: ctx.capacity.capacity,
      zones: compositionZonesOf(ctx.vehicles, ctx.stops),
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
      capacity: ctx.capacity.capacity,
      zones: compositionZonesOf(ctx.vehicles, ctx.stops),
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
}

/** D'où part chaque camionnette occupée par une tournée chargée ou partie (L7t-C2). */
function startsOf(
  settings: RoutingSettings,
  cost: CostFn,
  busy: Parameters<typeof busyStarts>[1],
): ReadonlyMap<string, VehicleStart> {
  return busyStarts({ depotId: DEPOT_ID, cost, settings }, busy);
}

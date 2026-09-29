import type { CostFn } from "../ports/distance-matrix.js";
import type { RoutingSettings } from "../value-objects/routing-settings.js";
import { compareIds } from "./compare-ids.js";
import { improvePlans } from "./improve-plans.js";
import { insertCheapest } from "./insert-cheapest.js";
import type { PlanningContext, PlanningVehicle, Proposal, ProposedTour } from "./proposal.js";
import { durationOf, type RoutingStop, type TimedRoute, timeRoute } from "./route-timing.js";
import { clockOf, maxSecondsOf, openingOf, timeVehicle, type VehiclePlan } from "./vehicle-plan.js";

/** Un arrêt à placer : la commande (son id est celui de la matrice), sa fenêtre, sa tournée actuelle. */
export interface PlannableStop extends RoutingStop {
  /** La tournée recomposable qui le porte aujourd'hui, ou `null` : à répartir. */
  readonly homeRoundId: string | null;
}

/** Une tournée existante que la proposition peut réutiliser (non partie, rien de chargé). */
export interface RecomposableRound {
  readonly roundId: string;
  readonly vehicleId: string;
  readonly vehicleName: string;
  readonly passage: number;
}

export interface ProposalInput {
  readonly depotId: string;
  readonly stops: readonly PlannableStop[];
  readonly vehicles: readonly PlanningVehicle[];
  readonly recomposable: readonly RecomposableRound[];
  readonly cost: CostFn;
  readonly settings: RoutingSettings;
  /**
   * Combien de tournées NEUVES ou reprises chaque véhicule peut encore
   * recevoir ; absent : autant qu'il en faut. Un seul passage permis et une
   * tournée déjà gardée : 0.
   */
  readonly passageLimits?: ReadonlyMap<string, number>;
}

/**
 * **La proposition en tournées neuves** (L7b-C1 à C3) : les arrêts sont
 * posés un à un, créneaux les plus serrés d'abord, là où ils coûtent le moins
 * sur TOUS les véhicules à la fois — route, attente, minutes hors créneau
 * lourdement pénalisées, tournée ouverte comptée —, puis la répartition est
 * améliorée par gestes locaux tant que le coût baisse. Un second passage
 * n'existe que si la journée ne tient pas autrement : il coûte une tournée
 * ouverte, que la tournée existante évite dès qu'elle peut prendre l'arrêt.
 *
 * Ce qui ne tient nulle part — aller-retour seul au-delà de la durée
 * maximale, ou plus de passage permis — déborde : à répartir, signalé, jamais
 * tronqué en silence. S'il vient d'une tournée existante, il y RESTE, en
 * dernier, et la tournée est signalée trop longue — la proposition ne défait
 * jamais un placement qu'elle ne sait pas refaire.
 *
 * Les passages d'un véhicule reprennent ses tournées recomposables dans
 * l'ordre de leur passage ; au-delà, des tournées à ouvrir.
 *
 * Pure et déterministe (L7-C12) : même entrée, même proposition.
 */
export function proposeRounds(input: ProposalInput): Proposal {
  const vehicles = [...input.vehicles].sort((a, b) => compareIds(a.id, b.id));
  const stops = [...input.stops].sort((a, b) => compareIds(a.id, b.id));
  const byId = new Map(stops.map((stop) => [stop.id, stop]));
  const initial: readonly VehiclePlan[] = vehicles.map((vehicle) => ({
    vehicle,
    maxRoutes: input.passageLimits?.get(vehicle.id) ?? Infinity,
    routes: [],
  }));
  const built = insertCheapest(input, initial, stops, "anywhere");
  const plans = improvePlans(input, built.plans, new Set());
  const tours = plans.flatMap((plan) => toursOf(input, plan));
  const spilled = built.unplaced.flatMap((stop) => byId.get(stop.id) ?? []);
  return {
    tours: keepAtHome(input, tours, spilled),
    overflow: spilled
      .filter((stop) => stop.homeRoundId === null)
      .map((stop) => stop.id)
      .sort(compareIds),
  };
}

/** Les tournées d'un véhicule, chronométrées ; elles reprennent ses recomposables dans l'ordre. */
function toursOf(input: ProposalInput, plan: VehiclePlan): readonly ProposedTour[] {
  const rounds = input.recomposable
    .filter((round) => round.vehicleId === plan.vehicle.id)
    .sort((a, b) => a.passage - b.passage);
  const timed = timeVehicle(input, plan.routes, openingOf(input));
  return plan.routes.flatMap(({ stops }, index) => {
    const route = timed[index];
    return route === undefined
      ? []
      : [tourOf(input, plan.vehicle, index + 1, rounds[index]?.roundId ?? null, stops, route)];
  });
}

/** Les débordés qui avaient une tournée y restent, en dernier. */
function keepAtHome(
  input: ProposalInput,
  tours: readonly ProposedTour[],
  spilled: readonly PlannableStop[],
): readonly ProposedTour[] {
  const result = [...tours];
  const homes = [...new Set(spilled.flatMap((stop) => stop.homeRoundId ?? []))].sort(compareIds);
  for (const roundId of homes) {
    const staying = spilled.filter((stop) => stop.homeRoundId === roundId);
    const index = result.findIndex((tour) => tour.roundId === roundId);
    const existing = result[index];
    if (existing !== undefined) {
      const stops = [...existing.stops, ...staying];
      const timed = timeRoute(
        input.depotId,
        stops,
        input.cost,
        clockOf(input, existing.timed.departure),
      );
      result[index] = tourOf(input, vehicleOf(existing), existing.rank, roundId, stops, timed);
      continue;
    }
    const round = input.recomposable.find((candidate) => candidate.roundId === roundId);
    if (round === undefined) {
      continue;
    }
    const own = result.filter((tour) => tour.vehicleId === round.vehicleId);
    const earliest = Math.max(openingOf(input), ...own.map((tour) => tour.timed.return));
    const vehicle = { id: round.vehicleId, name: round.vehicleName };
    const timed = timeRoute(input.depotId, staying, input.cost, clockOf(input, earliest));
    result.push(tourOf(input, vehicle, own.length + 1, roundId, staying, timed));
  }
  return result;
}

function vehicleOf(tour: ProposedTour): PlanningVehicle {
  return { id: tour.vehicleId, name: tour.vehicleName };
}

/** Une tournée proposée ; trop longue, elle est signalée. */
export function tourOf(
  ctx: PlanningContext,
  vehicle: PlanningVehicle,
  rank: number,
  roundId: string | null,
  stops: readonly RoutingStop[],
  timed: TimedRoute,
): ProposedTour {
  return {
    roundId,
    vehicleId: vehicle.id,
    vehicleName: vehicle.name,
    rank,
    stops,
    timed,
    overDuration: durationOf(timed) > maxSecondsOf(ctx),
  };
}

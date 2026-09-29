import type { CostFn } from "../ports/distance-matrix.js";
import type { RoutingSettings } from "../value-objects/routing-settings.js";
import { partitionStops } from "./fleet-planner.js";
import { compareIds, optimizeRoute } from "./route-optimizer.js";
import {
  durationOf,
  type RouteClock,
  type RoutingStop,
  type TimedRoute,
  timeRoute,
} from "./route-timing.js";

const SECONDS_PER_MINUTE = 60;

/** Un arrêt à placer : la commande (son id est celui de la matrice), sa fenêtre, sa tournée actuelle. */
export interface PlannableStop extends RoutingStop {
  /** La tournée recomposable qui le porte aujourd'hui, ou `null` : à répartir. */
  readonly homeRoundId: string | null;
}

export interface PlanningVehicle {
  readonly id: string;
  readonly name: string;
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

/** Une tournée proposée, chronométrée. */
export interface ProposedTour {
  readonly roundId: string | null;
  readonly vehicleId: string;
  readonly vehicleName: string;
  /** Le rang du passage de ce véhicule dans la proposition, 1..n. */
  readonly rank: number;
  readonly stops: readonly RoutingStop[];
  readonly timed: TimedRoute;
  readonly overDuration: boolean;
}

export interface Proposal {
  readonly tours: readonly ProposedTour[];
  /** Les commandes à répartir qu'aucune tournée ne tient dans la durée maximale. */
  readonly overflow: readonly string[];
}

export interface Passage {
  readonly stops: readonly RoutingStop[];
  readonly timed: TimedRoute;
  readonly earliest: number;
}

/**
 * **La proposition** (L7-C3, L7-C5, L7-C15) : répartir entre les véhicules
 * (k-medoids sur les coûts), ordonner chaque tournée (ATSP), puis découper ce
 * qui dépasse la durée maximale en passages successifs du MÊME véhicule (Q13)
 * — le second part au retour du premier.
 *
 * Un arrêt dont l'aller-retour seul dépasse la durée maximale déborde : à
 * répartir, signalé, jamais tronqué en silence. S'il vient d'une tournée
 * existante, il y RESTE, en dernier, et la tournée est signalée trop longue —
 * la proposition ne défait jamais un placement qu'elle ne sait pas refaire.
 *
 * Les passages d'un véhicule reprennent ses tournées recomposables dans
 * l'ordre de leur passage ; au-delà, des tournées à ouvrir.
 *
 * Pure et déterministe (L7-C12) : même entrée, même proposition.
 */
export function proposeRounds(input: ProposalInput): Proposal {
  const vehicles = [...input.vehicles].sort((a, b) => compareIds(a.id, b.id));
  const byId = new Map(input.stops.map((stop) => [stop.id, stop]));
  const clusters = partitionStops(
    input.depotId,
    input.stops.map((stop) => stop.id),
    vehicles.length,
    input.cost,
  );
  const tours: ProposedTour[] = [];
  const spilled: PlannableStop[] = [];
  clusters.forEach((members, index) => {
    const vehicle = vehicles[index];
    if (vehicle === undefined) {
      return;
    }
    const stops = members.flatMap((id) => byId.get(id) ?? []);
    const { passages, overflow } = passagesOf(input, stops, {
      limit: input.passageLimits?.get(vehicle.id) ?? Infinity,
    });
    const rounds = recomposableOf(input.recomposable, vehicle.id);
    passages.forEach((passage, rank) => {
      tours.push(tourOf(input, vehicle, rank + 1, rounds[rank]?.roundId ?? null, passage));
    });
    spilled.push(...overflow.flatMap((stop) => byId.get(stop.id) ?? []));
  });
  const kept = keepAtHome(input, tours, spilled);
  return {
    tours: kept,
    overflow: spilled.filter((stop) => stop.homeRoundId === null).map((stop) => stop.id),
  };
}

/** Ce qu'il faut pour chronométrer et découper : le départ, la matrice, les réglages. */
export type PlanningContext = Pick<ProposalInput, "depotId" | "cost" | "settings">;

/**
 * Ordonne un groupe, puis le découpe en passages qui tiennent la durée
 * maximale — au plus `limit`, le premier partant au plus tôt à `from` (par
 * défaut l'heure au plus tôt). Au-delà de la limite, tout déborde.
 */
export function passagesOf(
  input: PlanningContext,
  stops: readonly RoutingStop[],
  options: { readonly from?: number; readonly limit?: number } = {},
): { readonly passages: readonly Passage[]; readonly overflow: readonly RoutingStop[] } {
  const limit = options.limit ?? Infinity;
  const maxSeconds = input.settings.maxRoundMinutes * SECONDS_PER_MINUTE;
  const clockAt = (earliest: number): RouteClock => ({
    earliestDeparture: earliest,
    stopSeconds: input.settings.stopMinutes * SECONDS_PER_MINUTE,
  });
  const fits = (sequence: readonly RoutingStop[], earliest: number): boolean =>
    durationOf(timeRoute(input.depotId, sequence, input.cost, clockAt(earliest))) <= maxSeconds;
  let earliest = Math.max(
    options.from ?? 0,
    input.settings.earliestDepartureMinute * SECONDS_PER_MINUTE,
  );
  const remaining = [...optimizeRoute(input.depotId, stops, input.cost, clockAt(earliest))];
  const passages: Passage[] = [];
  const overflow: RoutingStop[] = [];
  while (remaining.length > 0) {
    if (passages.length >= limit) {
      overflow.push(...remaining.splice(0));
      break;
    }
    let size = 0;
    while (size < remaining.length && fits(remaining.slice(0, size + 1), earliest)) {
      size += 1;
    }
    if (size === 0) {
      overflow.push(...remaining.splice(0, 1));
      continue;
    }
    const prefix = remaining.splice(0, size);
    const optimized = optimizeRoute(input.depotId, prefix, input.cost, clockAt(earliest));
    const sequence = fits(optimized, earliest) ? optimized : prefix;
    const timed = timeRoute(input.depotId, sequence, input.cost, clockAt(earliest));
    passages.push({ stops: sequence, timed, earliest });
    earliest = timed.return;
  }
  return { passages, overflow };
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
      const earliest = existing.timed.departure;
      result[index] = retimed(input, existing, [...existing.stops, ...staying], earliest);
      continue;
    }
    const round = input.recomposable.find((candidate) => candidate.roundId === roundId);
    if (round === undefined) {
      continue;
    }
    const own = result.filter((tour) => tour.vehicleId === round.vehicleId);
    const earliest = Math.max(
      input.settings.earliestDepartureMinute * SECONDS_PER_MINUTE,
      ...own.map((tour) => tour.timed.return),
    );
    const vehicle = { id: round.vehicleId, name: round.vehicleName };
    const timed = timeRoute(input.depotId, staying, input.cost, clockOf(input, earliest));
    result.push(
      tourOf(input, vehicle, own.length + 1, roundId, { stops: staying, timed, earliest }),
    );
  }
  return result;
}

function retimed(
  input: ProposalInput,
  tour: ProposedTour,
  stops: readonly RoutingStop[],
  earliest: number,
): ProposedTour {
  const timed = timeRoute(input.depotId, stops, input.cost, clockOf(input, earliest));
  return {
    ...tour,
    stops,
    timed,
    overDuration: durationOf(timed) > input.settings.maxRoundMinutes * SECONDS_PER_MINUTE,
  };
}

function tourOf(
  input: ProposalInput,
  vehicle: PlanningVehicle,
  rank: number,
  roundId: string | null,
  passage: Passage,
): ProposedTour {
  return {
    roundId,
    vehicleId: vehicle.id,
    vehicleName: vehicle.name,
    rank,
    stops: passage.stops,
    timed: passage.timed,
    overDuration: durationOf(passage.timed) > input.settings.maxRoundMinutes * SECONDS_PER_MINUTE,
  };
}

function clockOf(input: ProposalInput, earliest: number): RouteClock {
  return {
    earliestDeparture: earliest,
    stopSeconds: input.settings.stopMinutes * SECONDS_PER_MINUTE,
  };
}

/** Les tournées recomposables d'un véhicule, dans l'ordre de leur passage. */
function recomposableOf(
  rounds: readonly RecomposableRound[],
  vehicleId: string,
): readonly RecomposableRound[] {
  return rounds
    .filter((round) => round.vehicleId === vehicleId)
    .sort((a, b) => a.passage - b.passage);
}

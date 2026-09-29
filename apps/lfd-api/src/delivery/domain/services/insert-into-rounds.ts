import { partitionStops } from "./fleet-planner.js";
import {
  type Passage,
  passagesOf,
  type PlanningContext,
  type PlanningVehicle,
  type Proposal,
  type ProposedTour,
} from "./propose-rounds.js";
import { compareIds } from "./route-optimizer.js";
import {
  durationOf,
  type RouteClock,
  type RoutingStop,
  routeScore,
  timeRoute,
} from "./route-timing.js";

const SECONDS_PER_MINUTE = 60;

/** Une tournée existante, au dépôt, dont chaque arrêt est situé : on peut y insérer. */
export interface InsertableRound {
  readonly roundId: string;
  readonly vehicleId: string;
  readonly vehicleName: string;
  readonly passage: number;
  /** Ses arrêts, dans l'ordre choisi À LA MAIN : il ne sera pas changé. */
  readonly stops: readonly RoutingStop[];
}

export interface InsertionInput extends PlanningContext {
  /** Les commandes à répartir, situées. */
  readonly stops: readonly RoutingStop[];
  readonly vehicles: readonly PlanningVehicle[];
  readonly rounds: readonly InsertableRound[];
  /** Combien de tournées NEUVES chaque véhicule peut recevoir ; absent : autant qu'il en faut. */
  readonly passageLimits?: ReadonlyMap<string, number>;
}

/** Une tournée d'un véhicule pendant le calcul : sa séquence, qui grandit. */
interface Working {
  readonly round: InsertableRound;
  stops: RoutingStop[];
  inserted: boolean;
}

/**
 * **Insérer** les commandes à répartir dans les tournées existantes (mode
 * `insert`, décision de Hugo du 2026-09-29) : chaque commande va au véhicule
 * que lui donne la répartition (k-medoids), puis, parmi les tournées de ce
 * véhicule, à la place qui coûte le MOINS — durée et retards pondérés
 * compris — sans que la tournée dépasse la durée maximale.
 *
 * 🔴 **L'ordre relatif des arrêts placés à la main ne change jamais** : on
 * insère entre eux, on ne les réordonne pas. Ce qui ne tient nulle part va à
 * des tournées neuves — seulement si le véhicule a encore droit à un passage
 * (`passageLimits`) —, sinon déborde, signalé.
 *
 * Déterministe : la meilleure insertion est cherchée dans un ordre fixe
 * (commande par identifiant, tournée par passage, place par rang), et seule
 * une amélioration STRICTE la remplace.
 */
export function insertIntoRounds(input: InsertionInput): Proposal {
  const vehicles = [...input.vehicles].sort((a, b) => compareIds(a.id, b.id));
  const byId = new Map(input.stops.map((stop) => [stop.id, stop]));
  const clusters = partitionStops(
    input.depotId,
    input.stops.map((stop) => stop.id),
    vehicles.length,
    input.cost,
  );
  const tours: ProposedTour[] = [];
  const overflow: string[] = [];
  clusters.forEach((members, index) => {
    const vehicle = vehicles[index];
    if (vehicle === undefined) {
      return;
    }
    const working = input.rounds
      .filter((round) => round.vehicleId === vehicle.id)
      .sort((a, b) => a.passage - b.passage)
      .map((round) => ({ round, stops: [...round.stops], inserted: false }));
    const left = insertAll(
      input,
      working,
      members.flatMap((id) => byId.get(id) ?? []),
    );
    const vehicleTours = toursOf(input, vehicle, working, left);
    tours.push(...vehicleTours.tours);
    overflow.push(...vehicleTours.overflow);
  });
  return { tours, overflow: overflow.sort(compareIds) };
}

/** Insère au moindre surcoût tant qu'une place tient ; rend ce qui n'a trouvé place nulle part. */
function insertAll(
  input: InsertionInput,
  working: readonly Working[],
  pending: readonly RoutingStop[],
): readonly RoutingStop[] {
  const left = [...pending].sort((a, b) => compareIds(a.id, b.id));
  for (;;) {
    const best = cheapestInsertion(input, working, left);
    if (best === null) {
      return left;
    }
    const target = working[best.round];
    const [stop] = left.splice(best.stop, 1);
    if (target === undefined || stop === undefined) {
      return left;
    }
    target.stops.splice(best.position, 0, stop);
    target.inserted = true;
  }
}

function cheapestInsertion(
  input: InsertionInput,
  working: readonly Working[],
  left: readonly RoutingStop[],
): { readonly stop: number; readonly round: number; readonly position: number } | null {
  const maxSeconds = input.settings.maxRoundMinutes * SECONDS_PER_MINUTE;
  let best: { stop: number; round: number; position: number; delta: number } | null = null;
  const starts = earliestStarts(input, working);
  working.forEach((target, round) => {
    const clock = clockOf(input, starts[round] ?? 0);
    const before = routeScore(timeRoute(input.depotId, target.stops, input.cost, clock));
    left.forEach((stop, stopIndex) => {
      for (let position = 0; position <= target.stops.length; position += 1) {
        const sequence = [...target.stops];
        sequence.splice(position, 0, stop);
        const timed = timeRoute(input.depotId, sequence, input.cost, clock);
        const delta = routeScore(timed) - before;
        if (durationOf(timed) <= maxSeconds && (best === null || delta < best.delta)) {
          best = { stop: stopIndex, round, position, delta };
        }
      }
    });
  });
  return best;
}

/** Chaque tournée part au plus tôt au retour de la précédente du même véhicule. */
function earliestStarts(input: PlanningContext, working: readonly Working[]): readonly number[] {
  const starts: number[] = [];
  let from = input.settings.earliestDepartureMinute * SECONDS_PER_MINUTE;
  for (const target of working) {
    starts.push(from);
    from = timeRoute(input.depotId, target.stops, input.cost, clockOf(input, from)).return;
  }
  return starts;
}

/** Les tournées existantes qui ont reçu, puis les tournées neuves permises ; le reste déborde. */
function toursOf(
  input: InsertionInput,
  vehicle: PlanningVehicle,
  working: readonly Working[],
  left: readonly RoutingStop[],
): { readonly tours: readonly ProposedTour[]; readonly overflow: readonly string[] } {
  const starts = earliestStarts(input, working);
  const tours: ProposedTour[] = working.flatMap((target, index) => {
    if (!target.inserted) {
      return [];
    }
    const timed = timeRoute(
      input.depotId,
      target.stops,
      input.cost,
      clockOf(input, starts[index] ?? 0),
    );
    return [
      tourOf(input, vehicle, index + 1, target.round.roundId, {
        stops: target.stops,
        timed,
        earliest: 0,
      }),
    ];
  });
  const last = working.at(-1);
  const from =
    last === undefined
      ? 0
      : timeRoute(input.depotId, last.stops, input.cost, clockOf(input, starts.at(-1) ?? 0)).return;
  const { passages, overflow } = passagesOf(input, left, {
    from,
    limit: input.passageLimits?.get(vehicle.id) ?? Infinity,
  });
  passages.forEach((passage, index) => {
    tours.push(tourOf(input, vehicle, working.length + index + 1, null, passage));
  });
  return { tours, overflow: overflow.map((stop) => stop.id) };
}

function tourOf(
  input: PlanningContext,
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

function clockOf(input: PlanningContext, earliest: number): RouteClock {
  return {
    earliestDeparture: earliest,
    stopSeconds: input.settings.stopMinutes * SECONDS_PER_MINUTE,
  };
}

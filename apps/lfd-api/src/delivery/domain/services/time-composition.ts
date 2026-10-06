import type { CostFn } from "../ports/distance-matrix.js";
import type { RoutingSettings } from "../value-objects/routing-settings.js";
import type { PlanningVehicle, ProposedTour } from "./proposal.js";
import {
  DAY_START,
  durationOf,
  type RouteClock,
  type RoutingStop,
  type TimedRoute,
  timeChain,
  timeRoute,
} from "./route-timing.js";

const SECONDS_PER_MINUTE = 60;

/** Une tournée telle que l'écran l'a composée : ses arrêts dans l'ordre voulu. */
export interface ComposedRound {
  readonly roundId: string | null;
  readonly vehicle: PlanningVehicle;
  readonly stops: readonly RoutingStop[];
}

export interface CompositionInput {
  readonly depotId: string;
  readonly rounds: readonly ComposedRound[];
  readonly cost: CostFn;
  readonly settings: RoutingSettings;
}

/**
 * **Chronomètre une composition telle quelle** (L10b-C2) — ni répartition,
 * ni réordonnancement : l'ordre est celui qu'on a glissé à la main, et c'est
 * tout l'objet. Les passages d'un même véhicule sont chronométrés ENSEMBLE,
 * dans l'ordre reçu (`timeChain`, CA2) : chacun part au plus tard qui tient
 * ses échéances et celles des suivants, jamais avant minuit du jour ni avant
 * le retour du précédent — comme dans `proposeRounds` (Q13). Une tournée trop
 * longue est signalée, jamais coupée ni refusée (Q2).
 *
 * Rend les tournées dans l'ordre reçu. Pure et déterministe.
 */
export function timeComposition(input: CompositionInput): readonly ProposedTour[] {
  const maxSeconds = input.settings.maxRoundMinutes * SECONDS_PER_MINUTE;
  const clock = compositionClockOf(input.settings);
  const timedById = timeByVehicle(input, clock);
  const passages = new Map<string, number>();
  return input.rounds.map((round, index) => {
    const vehicleId = round.vehicle.id;
    const timed = timedById[index] ?? timeRoute(input.depotId, round.stops, input.cost, clock);
    const rank = (passages.get(vehicleId) ?? 0) + 1;
    passages.set(vehicleId, rank);
    return {
      roundId: round.roundId,
      vehicleId,
      vehicleName: round.vehicle.name,
      rank,
      stops: round.stops,
      timed,
      overDuration: durationOf(timed) > maxSeconds,
    };
  });
}

/** L'horloge d'une composition : plancher à minuit du jour (CA2, Q1), réglages en vigueur. */
export function compositionClockOf(settings: RoutingSettings): RouteClock {
  return {
    earliestDeparture: DAY_START,
    stopSeconds: settings.stopMinutes * SECONDS_PER_MINUTE,
    idleDeparture: settings.earliestDepartureMinute * SECONDS_PER_MINUTE,
    safetySeconds: settings.safetyMarginMinutes * SECONDS_PER_MINUTE,
  };
}

/** Chaque tournée chronométrée avec les autres passages de son véhicule, indexée comme reçue. */
function timeByVehicle(input: CompositionInput, clock: RouteClock): readonly TimedRoute[] {
  const indicesByVehicle = new Map<string, number[]>();
  input.rounds.forEach((round, index) => {
    const indices = indicesByVehicle.get(round.vehicle.id) ?? [];
    indices.push(index);
    indicesByVehicle.set(round.vehicle.id, indices);
  });
  const timed: TimedRoute[] = new Array<TimedRoute>(input.rounds.length);
  for (const indices of indicesByVehicle.values()) {
    const chain = timeChain(
      input.depotId,
      indices.map((index) => input.rounds[index]?.stops ?? []),
      input.cost,
      clock,
    );
    chain.forEach((route, position) => {
      const index = indices[position];
      if (index !== undefined) {
        timed[index] = route;
      }
    });
  }
  return timed;
}

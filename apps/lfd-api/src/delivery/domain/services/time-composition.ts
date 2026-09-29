import type { CostFn } from "../ports/distance-matrix.js";
import type { RoutingSettings } from "../value-objects/routing-settings.js";
import type { PlanningVehicle, ProposedTour } from "./propose-rounds.js";
import { durationOf, type RoutingStop, timeRoute } from "./route-timing.js";

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
 * tout l'objet. Chaque tournée part au plus tôt à l'heure réglée ; le passage
 * suivant d'un même véhicule, à son retour du précédent — comme dans
 * `proposeRounds` (Q13). Une tournée trop longue est signalée, jamais coupée.
 *
 * Rend les tournées dans l'ordre reçu. Pure et déterministe.
 */
export function timeComposition(input: CompositionInput): readonly ProposedTour[] {
  const opening = input.settings.earliestDepartureMinute * SECONDS_PER_MINUTE;
  const maxSeconds = input.settings.maxRoundMinutes * SECONDS_PER_MINUTE;
  const stopSeconds = input.settings.stopMinutes * SECONDS_PER_MINUTE;
  const lastReturn = new Map<string, number>();
  const passages = new Map<string, number>();
  return input.rounds.map((round) => {
    const vehicleId = round.vehicle.id;
    const earliest = Math.max(opening, lastReturn.get(vehicleId) ?? opening);
    const timed = timeRoute(input.depotId, round.stops, input.cost, {
      earliestDeparture: earliest,
      stopSeconds,
    });
    const rank = (passages.get(vehicleId) ?? 0) + 1;
    passages.set(vehicleId, rank);
    lastReturn.set(vehicleId, timed.return);
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

import type { CostFn } from "../ports/distance-matrix.js";

/** Une fenêtre en secondes depuis minuit ; `start` nul = « dès l'ouverture ». */
export interface TimeWindow {
  readonly start: number | null;
  readonly end: number;
}

/** Un arrêt à ordonner : son identifiant dans la matrice, et sa fenêtre. */
export interface RoutingStop {
  readonly id: string;
  readonly window: TimeWindow | null;
}

/** Ce que le calcul sait de l'horloge d'une tournée, en secondes. */
export interface RouteClock {
  /** On ne part pas avant (l'heure au plus tôt, ou le retour du passage précédent). */
  readonly earliestDeparture: number;
  /** Le temps passé à chaque livraison. */
  readonly stopSeconds: number;
}

/** Une tournée chronométrée — tout en secondes depuis minuit. */
export interface TimedRoute {
  readonly departure: number;
  readonly return: number;
  readonly meters: number;
  /** L'arrivée estimée à chaque arrêt, dans l'ordre. */
  readonly arrivals: readonly number[];
  /** L'arrivée tombe après la fin de la fenêtre. */
  readonly missed: readonly boolean[];
  /** La somme des retards sur les fins de fenêtre. */
  readonly lateSeconds: number;
}

/**
 * Un retard compte DIX fois une seconde de route : un arrêt dont la fenêtre
 * finit tôt passe devant (L7-C4), sans que la fenêtre devienne une contrainte
 * dure — OR-Tools n'entre que le jour où elle le devient.
 */
export const LATE_WEIGHT = 10;

/**
 * **Chronomètre une tournée** (L7-C15) : départ et retour au point de départ,
 * temps d'arrêt compté à chaque livraison.
 *
 * Le départ est au plus tôt, et **plus tard si la première fenêtre le
 * permet** : début de la première fenêtre moins le trajet, sans descendre
 * sous l'heure au plus tôt. Arrivé avant l'ouverture d'une fenêtre, on
 * attend ; arrivé après sa fin, on livre quand même — et c'est signalé.
 */
export function timeRoute(
  depotId: string,
  sequence: readonly RoutingStop[],
  cost: CostFn,
  clock: RouteClock,
): TimedRoute {
  const first = sequence[0];
  if (first === undefined) {
    const at = clock.earliestDeparture;
    return { departure: at, return: at, meters: 0, arrivals: [], missed: [], lateSeconds: 0 };
  }
  const firstStart = first.window?.start ?? null;
  const departure =
    firstStart === null
      ? clock.earliestDeparture
      : Math.max(clock.earliestDeparture, firstStart - cost.seconds(depotId, first.id));
  const arrivals: number[] = [];
  const missed: boolean[] = [];
  let at = departure;
  let meters = 0;
  let lateSeconds = 0;
  let previous = depotId;
  for (const stop of sequence) {
    at += cost.seconds(previous, stop.id);
    meters += cost.meters(previous, stop.id);
    arrivals.push(at);
    const late = stop.window === null ? 0 : Math.max(0, at - stop.window.end);
    missed.push(late > 0);
    lateSeconds += late;
    at = Math.max(at, stop.window?.start ?? at) + clock.stopSeconds;
    previous = stop.id;
  }
  meters += cost.meters(previous, depotId);
  return {
    departure,
    return: at + cost.seconds(previous, depotId),
    meters,
    arrivals,
    missed,
    lateSeconds,
  };
}

/** Ce qu'une tournée coûte à l'ordonnanceur : sa durée, plus ses retards pondérés. */
export function routeScore(route: TimedRoute): number {
  return route.return - route.departure + LATE_WEIGHT * route.lateSeconds;
}

/** La durée d'une tournée, départ → retour. */
export function durationOf(route: TimedRoute): number {
  return route.return - route.departure;
}

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
  /**
   * Le temps de livraison sur place de CET arrêt, en secondes — la valeur de
   * son adresse (L7b-C4) ; absent : celui de l'horloge, le réglage global.
   */
  readonly stopSeconds?: number | undefined;
}

/**
 * Minuit du jour de livraison, en secondes : le plancher de tout départ
 * (CA2, Q1 — Hugo, 2026-10-03). Rien ne part la veille.
 */
export const DAY_START = 0;

/** Ce que le calcul sait de l'horloge d'une tournée, en secondes. */
export interface RouteClock {
  /**
   * Le plancher : on ne part pas avant — minuit du jour (`DAY_START`), ou le
   * retour du passage précédent, ou de ce que le véhicule porte déjà.
   */
  readonly earliestDeparture: number;
  /** Le temps passé à une livraison dont l'adresse ne dit rien (le réglage global). */
  readonly stopSeconds: number;
  /**
   * Le départ d'une tournée qu'AUCUNE échéance ne presse — ni la sienne, ni
   * celle d'un passage suivant (l'heure réglée, CA2) ; absent : le plancher.
   */
  readonly idleDeparture?: number | undefined;
  /**
   * La marge de sécurité visée avant chaque fin de fenêtre, quand le départ
   * le permet ; absent : aucune.
   */
  readonly safetySeconds?: number | undefined;
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
 * **Le départ au plus tard d'une tournée** (CA2, CA-D1 — Hugo, 2026-10-03 :
 * « tout le monde est servi avant son échéance ») : passe arrière, du retour
 * au premier arrêt. Chaque arrêt doit être atteint avant la fin de sa fenêtre
 * (moins la marge, sans descendre sous son début), ET assez tôt pour que la
 * suite tienne ; le retour, avant `returnBy` — le départ au plus tard du
 * passage suivant du même véhicule.
 *
 * Un début de fenêtre qui rend la suite intenable quoi qu'on fasse (l'attente
 * à la porte pousse forcément au-delà) borne l'arrivée à ce début : arriver
 * plus tôt n'y changerait rien. La suite sera en retard du moins possible, et
 * c'est le chronométrage qui le signale.
 *
 * Rend `Infinity` si rien ne presse : aucune fin de fenêtre, aucun passage
 * suivant pressé. Une tournée vide rend `returnBy`.
 */
export function latestDeparture(
  depotId: string,
  stops: readonly RoutingStop[],
  cost: CostFn,
  clock: RouteClock,
  returnBy: number,
): number {
  const margin = clock.safetySeconds ?? 0;
  let latest = returnBy;
  let next = depotId;
  for (let index = stops.length - 1; index >= 0; index -= 1) {
    const stop = stops[index];
    if (stop === undefined) {
      continue;
    }
    const leaveBy = latest - cost.seconds(stop.id, next) - (stop.stopSeconds ?? clock.stopSeconds);
    const opens = stop.window?.start ?? -Infinity;
    const end = stop.window === null ? Infinity : Math.max(opens, stop.window.end - margin);
    latest = Math.min(end, Math.max(leaveBy, opens));
    next = stop.id;
  }
  return stops.length === 0 ? returnBy : latest - cost.seconds(depotId, next);
}

/**
 * Les départs au plus tard des passages d'un véhicule, dans l'ordre (CA2) :
 * passe arrière sur TOUT le véhicule — le passage n+1 part au retour du
 * passage n, donc une échéance du second presse le premier.
 */
export function latestDepartures(
  depotId: string,
  routes: readonly (readonly RoutingStop[])[],
  cost: CostFn,
  clock: RouteClock,
): readonly number[] {
  const latest: number[] = new Array<number>(routes.length);
  let returnBy = Infinity;
  for (let index = routes.length - 1; index >= 0; index -= 1) {
    returnBy = latestDeparture(depotId, routes[index] ?? [], cost, clock, returnBy);
    latest[index] = returnBy;
  }
  return latest;
}

/**
 * Le départ retenu : au plus tard (`latest`), jamais sous le plancher — et si
 * le plancher l'emporte, l'échéance ne tient pas : le retard sera signalé.
 * Rien ne presse : l'heure réglée, ou plus tard si la première fenêtre
 * l'ouvre plus tard (on ne part pas pour attendre devant la porte).
 */
export function departureOf(
  depotId: string,
  stops: readonly RoutingStop[],
  cost: CostFn,
  clock: RouteClock,
  latest: number,
): number {
  const floor = clock.earliestDeparture;
  if (latest !== Infinity) {
    return Math.max(floor, latest);
  }
  const idle = clock.idleDeparture ?? floor;
  const first = stops[0];
  const opens = first?.window?.start ?? null;
  const preferred =
    first === undefined || opens === null
      ? idle
      : Math.max(idle, opens - cost.seconds(depotId, first.id));
  return Math.max(floor, preferred);
}

/**
 * **Chronomètre une tournée** (L7-C15) : départ et retour au point de départ,
 * temps d'arrêt compté à chaque livraison. Seule, elle n'a pas de passage
 * suivant : `timeChain` pour les passages d'un véhicule.
 */
export function timeRoute(
  depotId: string,
  sequence: readonly RoutingStop[],
  cost: CostFn,
  clock: RouteClock,
): TimedRoute {
  const [route] = timeChain(depotId, [sequence], cost, clock);
  return route ?? emptyRoute(clock.earliestDeparture);
}

/**
 * **Chronomètre les passages d'un véhicule** (Q13, CA2) : chacun part au
 * plus tard qui sert encore chaque arrêt avant la fin de sa fenêtre, et
 * laisse au suivant le temps de tenir les siennes (`latestDepartures`) ;
 * jamais avant le plancher, ni avant le retour du précédent. Arrivé avant
 * l'ouverture d'une fenêtre, on attend ; arrivé après sa fin, on livre quand
 * même — et c'est signalé (`missed`, `lateSeconds`), jamais tu.
 */
export function timeChain(
  depotId: string,
  routes: readonly (readonly RoutingStop[])[],
  cost: CostFn,
  clock: RouteClock,
): readonly TimedRoute[] {
  const latest = latestDepartures(depotId, routes, cost, clock);
  const timed: TimedRoute[] = [];
  let floor = clock.earliestDeparture;
  routes.forEach((stops, index) => {
    const at = { ...clock, earliestDeparture: floor };
    const route = runRoute(depotId, stops, cost, at, latest[index] ?? Infinity);
    timed.push(route);
    floor = route.return;
  });
  return timed;
}

function emptyRoute(at: number): TimedRoute {
  return { departure: at, return: at, meters: 0, arrivals: [], missed: [], lateSeconds: 0 };
}

function runRoute(
  depotId: string,
  sequence: readonly RoutingStop[],
  cost: CostFn,
  clock: RouteClock,
  latest: number,
): TimedRoute {
  if (sequence.length === 0) {
    return emptyRoute(clock.earliestDeparture);
  }
  const departure = departureOf(depotId, sequence, cost, clock, latest);
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
    at = Math.max(at, stop.window?.start ?? at) + (stop.stopSeconds ?? clock.stopSeconds);
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

/** La durée d'une tournée, départ → retour. */
export function durationOf(route: TimedRoute): number {
  return route.return - route.departure;
}

import type { PlanningContext, PlanningVehicle } from "./proposal.js";
import { type RouteClock, type RoutingStop, type TimedRoute, timeRoute } from "./route-timing.js";

const SECONDS_PER_MINUTE = 60;

/**
 * Une minute hors créneau coûte CENT minutes de route (L7b-C2) : plus que
 * n'importe quel détour ou passage de plus à l'échelle d'une journée. Le
 * créneau reste une contrainte douce — on livre quand même, signalé (L7-C4) —
 * mais le calcul ne rend un retard que si aucune place ne l'évite.
 */
export const LATE_WEIGHT = 100;

/**
 * Ouvrir une tournée coûte une heure (L7b-C2, C3) : c'est le prix qu'on met
 * sur un aller-retour de plus, un chargement de plus, un livreur de plus. Une
 * heure d'attente ou de détour coûte donc moins qu'une tournée ouverte pour un
 * arrêt que la tournée existante pouvait prendre.
 */
export const ROUND_OPENING_SECONDS = 60 * SECONDS_PER_MINUTE;

/**
 * Une tournée pendant le calcul. `roundId` nomme une tournée EXISTANTE (mode
 * `insert`) : vidée, elle reste là, vide ; une tournée neuve (`null`) vidée
 * disparaît.
 */
export interface PlanRoute {
  readonly roundId: string | null;
  readonly stops: readonly RoutingStop[];
}

/**
 * Un second passage coûte EN PLUS la durée maximale d'une tournée (L7b-C3) :
 * il n'est ouvert que si la journée ne tient pas autrement. Toute place qui
 * tient dans une tournée existante — au plus la durée maximale de plus — ou
 * dans la première tournée d'un véhicule libre coûte moins.
 */
function passagePenaltyOf(ctx: PlanningContext): number {
  return maxSecondsOf(ctx);
}

/** Les tournées d'un véhicule, dans l'ordre de leurs passages. */
export type Routes = readonly PlanRoute[];

/** Un véhicule pendant le calcul. */
export interface VehiclePlan {
  readonly vehicle: PlanningVehicle;
  /** Combien de tournées il peut porter au plus ; `Infinity` : autant qu'il en faut. */
  readonly maxRoutes: number;
  readonly routes: Routes;
}

/** Ce qu'un véhicule coûte, et de combien ses tournées dépassent la durée maximale. */
export interface VehicleScore {
  readonly cost: number;
  readonly overSeconds: number;
}

/** L'horloge d'une tournée qui ne part pas avant `earliest`. */
export function clockOf(ctx: PlanningContext, earliest: number): RouteClock {
  return {
    earliestDeparture: earliest,
    stopSeconds: ctx.settings.stopMinutes * SECONDS_PER_MINUTE,
  };
}

/** L'heure au plus tôt des réglages, en secondes depuis minuit. */
export function openingOf(ctx: PlanningContext): number {
  return ctx.settings.earliestDepartureMinute * SECONDS_PER_MINUTE;
}

/** La durée maximale d'une tournée, en secondes. */
export function maxSecondsOf(ctx: PlanningContext): number {
  return ctx.settings.maxRoundMinutes * SECONDS_PER_MINUTE;
}

/**
 * Chronomètre les tournées d'un véhicule (Q13) : la première part au plus tôt
 * à `from` ; chacune des suivantes, au plus tôt au retour de la précédente.
 */
export function timeVehicle(
  ctx: PlanningContext,
  routes: Routes,
  from: number,
): readonly TimedRoute[] {
  const timed: TimedRoute[] = [];
  let earliest = from;
  for (const { stops } of routes) {
    const route = timeRoute(ctx.depotId, stops, ctx.cost, clockOf(ctx, earliest));
    timed.push(route);
    earliest = route.return;
  }
  return timed;
}

/**
 * **Le coût d'un véhicule** (L7b-C2) : minutes de route, d'attente et de
 * livraison (départ → retour), plus la pénalité des retards, plus celle de
 * chaque tournée ouverte — alourdie pour un second passage. Une tournée vide
 * ne coûte rien. Le dépassement de la durée maximale est rendu À PART : c'est
 * une borne, pas un prix — un geste qui l'augmente est refusé.
 *
 * Appelé des dizaines de milliers de fois par proposition : il refait le
 * chronométrage de `timeRoute` sans rien allouer. Les deux doivent rester
 * identiques — `vehicle-plan.spec.ts` le vérifie.
 */
export function scoreVehicle(ctx: PlanningContext, routes: Routes): VehicleScore {
  const maxSeconds = maxSecondsOf(ctx);
  const defaultStop = ctx.settings.stopMinutes * SECONDS_PER_MINUTE;
  let cost = 0;
  let overSeconds = 0;
  let opened = 0;
  let earliest = openingOf(ctx);
  for (const { stops } of routes) {
    const first = stops[0];
    if (first === undefined) {
      continue;
    }
    const firstStart = first.window?.start ?? null;
    const departure =
      firstStart === null
        ? earliest
        : Math.max(earliest, firstStart - ctx.cost.seconds(ctx.depotId, first.id));
    let at = departure;
    let late = 0;
    let previous = ctx.depotId;
    for (const stop of stops) {
      at += ctx.cost.seconds(previous, stop.id);
      const window = stop.window;
      if (window !== null) {
        late += Math.max(0, at - window.end);
        at = Math.max(at, window.start ?? at);
      }
      at += stop.stopSeconds ?? defaultStop;
      previous = stop.id;
    }
    const back = at + ctx.cost.seconds(previous, ctx.depotId);
    const duration = back - departure;
    cost +=
      duration +
      LATE_WEIGHT * late +
      ROUND_OPENING_SECONDS +
      (opened > 0 ? passagePenaltyOf(ctx) : 0);
    overSeconds += Math.max(0, duration - maxSeconds);
    opened += 1;
    earliest = back;
  }
  return { cost, overSeconds };
}

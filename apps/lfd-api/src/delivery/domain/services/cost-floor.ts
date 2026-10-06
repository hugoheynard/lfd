import type { PlanningContext } from "./proposal.js";
import type { RoutingStop } from "./route-timing.js";
import {
  clockOf,
  maxSecondsOf,
  type PlanRoute,
  ROUND_OPENING_SECONDS,
  type Routes,
  type VehicleStart,
} from "./vehicle-plan.js";

/**
 * Ce que les additions en virgule flottante peuvent perdre entre le minorant
 * et `scoreVehicle`, qui ne somment pas dans le même ordre — très au-dessus
 * de l'erreur réelle (1e-10 s sur une journée), très au-dessous d'une seconde.
 */
const FLOAT_SLACK = 1e-3;

/** Le minorant d'un véhicule, ses tournées notées une fois chacune. */
export type CostFloor = (routes: Routes, start: VehicleStart) => number;

/**
 * **Un minorant du `cost` d'un véhicule** (composition-automatique.md §5) :
 * ce que `scoreVehicle` ne peut pas descendre sous. Chaque tournée non vide
 * dure au moins sa route et ses livraisons — l'attente et la marge ne font
 * qu'ajouter —, et coûte son ouverture, alourdie d'un second passage
 * exactement comme dans `scoreVehicle`.
 *
 * Une tournée se note une fois : un geste garde intactes les tournées qu'il
 * ne touche pas (`replaced`), et le minorant d'une tournée ne dépend que de
 * ses arrêts. D'où un coût d'une route par tournée NEUVE, là où
 * `scoreVehicle` rechronomètre tout le véhicule, aller et retour.
 */
export function costFloorOf(ctx: PlanningContext): CostFloor {
  const known = new WeakMap<PlanRoute, number>();
  const defaultStop = clockOf(ctx, 0).stopSeconds;
  const penalty = maxSecondsOf(ctx);
  const routeFloor = (route: PlanRoute): number => {
    let floor = known.get(route);
    if (floor === undefined) {
      floor = travelAndService(ctx, route.stops, defaultStop);
      known.set(route, floor);
    }
    return floor;
  };
  return (routes, start) => {
    let total = 0;
    let opened = start.passagesBefore;
    for (const route of routes) {
      if (route.stops.length === 0) {
        continue;
      }
      total += routeFloor(route) + ROUND_OPENING_SECONDS + (opened > 0 ? penalty : 0);
      opened += 1;
    }
    return total;
  };
}

function travelAndService(
  ctx: PlanningContext,
  stops: readonly RoutingStop[],
  defaultStop: number,
): number {
  let total = 0;
  let previous = ctx.depotId;
  for (const stop of stops) {
    total += ctx.cost.seconds(previous, stop.id) + (stop.stopSeconds ?? defaultStop);
    previous = stop.id;
  }
  return total + ctx.cost.seconds(previous, ctx.depotId);
}

/**
 * Le score le plus FAVORABLE qu'un geste puisse atteindre : aucun retard
 * (`lateSeconds` n'est jamais négatif), et le minorant du coût, desserré de
 * l'erreur d'arrondi. `isBetterScore` est monotone — moins de retard et moins
 * de coût ne le rendent jamais faux — : si même ce score n'améliore pas, aucun
 * score réel ne le fera, et le geste s'écarte sans être chronométré.
 */
export function bestCase(floor: number): { readonly lateSeconds: number; readonly cost: number } {
  return { lateSeconds: 0, cost: floor - FLOAT_SLACK };
}

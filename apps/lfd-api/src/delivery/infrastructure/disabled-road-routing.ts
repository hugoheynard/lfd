import { RoadRoutingUnavailableError } from "../domain/errors/delivery-routing-errors.js";
import { type CostFn, DistanceMatrix } from "../domain/ports/distance-matrix.js";
import { RoadRoutingWaker } from "../domain/ports/road-routing-waker.js";
import { RouteGeometry, type RouteLine } from "../domain/ports/route-geometry.js";

/**
 * **Aucun calcul routier configuré** (L10b-C5) : sans `ROUTE_PLANNER_URL` — ou, en
 * production, sans `ROUTE_PLANNER_TOKEN` ou sans `https://` (L8b-C4) —, « Proposer »,
 * « Chronométrer » et le simulateur refusent en le disant. Le vol d'oiseau
 * qui tenait ce rôle a disparu. La carte de santé le signale au démarrage
 * (`capability-audit.ts`, « Planificateur de tournées (calcul routier) »).
 */
export class DisabledDistanceMatrix extends DistanceMatrix {
  build(): Promise<CostFn> {
    return Promise.reject(new RoadRoutingUnavailableError());
  }
}

/** Sans OSRM, pas de tracé : la carte montre les repères seuls. */
export class DisabledRouteGeometry extends RouteGeometry {
  trace(): Promise<RouteLine | null> {
    return Promise.resolve(null);
  }
}

/** Sans OSRM, rien à réveiller : l'ouverture du Tour manager ne sort pas sur le réseau. */
export class DisabledRoadRoutingWaker extends RoadRoutingWaker {
  wake(): Promise<void> {
    return Promise.resolve();
  }
}

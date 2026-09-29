import { RoadRoutingUnavailableError } from "../domain/errors/delivery-routing-errors.js";
import { type CostFn, DistanceMatrix } from "../domain/ports/distance-matrix.js";
import { RouteGeometry, type RouteLine } from "../domain/ports/route-geometry.js";

/**
 * **Aucun calcul routier configuré** (L10b-C5) : sans `OSRM_URL`, « Proposer »,
 * « Chronométrer » et le simulateur refusent en le disant. Le vol d'oiseau
 * qui tenait ce rôle a disparu. La carte de santé le signale au démarrage
 * (`capability-audit.ts`, « Calcul routier des tournées »).
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

import type { RouteGeometry, RouteLine } from "../domain/ports/route-geometry.js";
import type { ProposedTour } from "../domain/services/proposal.js";
import type { GeoPoint } from "../domain/value-objects/geo-point.js";

/**
 * **Le tracé de chaque tournée** (L10b-C4) — départ, arrêts dans l'ordre,
 * retour : une requête par tournée, toutes en même temps. Rendu dans l'ordre
 * des tournées ; `null` pour une tournée dont un point manque ou que la carte
 * routière n'a pas tracée. Ne lève jamais : un dessin ne refuse rien.
 */
export function routeLinesOf(
  geometry: RouteGeometry,
  depot: GeoPoint,
  tours: readonly ProposedTour[],
  pointOf: (stopId: string) => GeoPoint | null | undefined,
): Promise<readonly (RouteLine | null)[]> {
  return Promise.all(
    tours.map((tour) => {
      const stops = tour.stops.map((stop) => pointOf(stop.id) ?? null);
      if (stops.some((point) => point === null)) {
        return Promise.resolve(null);
      }
      const waypoints = [depot, ...stops.flatMap((point) => point ?? []), depot];
      return geometry.trace(waypoints).catch(() => null);
    }),
  );
}

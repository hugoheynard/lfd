import type { GeoPoint } from "../value-objects/geo-point.js";

/** Un tracé, en paires `[lng, lat]` — l'ordre de GeoJSON, celui que lit la carte. */
export type RouteLine = readonly (readonly [number, number])[];

/**
 * **Le tracé d'une tournée par la route** (L10b-C4) — de quoi la dessiner sur
 * la carte, rien de plus : aucune durée n'en est lue, elles viennent de
 * {@link DistanceMatrix}.
 *
 * Ne lève JAMAIS : un tracé manquant rend `null`, et la carte montre alors les
 * repères sans ligne. Refuser une proposition pour un dessin serait punir
 * l'équipe d'un détail d'affichage.
 */
export abstract class RouteGeometry {
  /** Le tracé qui passe par `waypoints` dans l'ordre (départ, arrêts, retour), ou `null`. */
  abstract trace(waypoints: readonly GeoPoint[]): Promise<RouteLine | null>;
}

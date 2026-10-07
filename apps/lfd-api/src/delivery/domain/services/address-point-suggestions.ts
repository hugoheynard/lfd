import type { AddressPointKind, AddressPointReference } from "@lfd/contracts";

import type { GeoPoint } from "../value-objects/geo-point.js";

/**
 * **Les corrections du carnet suggérées par les livraisons**
 * (`documentation/livraisons/gps-y-aller-et-position.md`, §6, règle
 * validée par Hugo le 2026-10-06). Pur : aucune lecture, aucune horloge.
 *
 * Quand assez de gestes à la MÊME adresse concordent — leurs positions
 * tiennent dans un petit rayon — et que leur centre est loin du point que le
 * carnet utilise, le bureau reçoit une suggestion. Jamais une correction
 * automatique.
 */

/** Combien de gestes concordants il faut au moins : deux peuvent être un hasard. */
export const MIN_CONCORDANT = 3;
/** Le rayon dans lequel des positions « concordent », en mètres. */
export const CLUSTER_RADIUS_M = 30;
/** L'écart à partir duquel le point du carnet est dit faux, en mètres. */
export const MIN_GAP_M = 50;
/**
 * Une position annoncée moins précise que ce rayon n'est pas un indice : un
 * téléphone qui dit « à 200 m près » ne situe pas une porte.
 */
export const MAX_ACCURACY_M = 50;
/**
 * Une position relevée à ce rayon du DÉPÔT n'est pas un indice sur la porte
 * d'un client (Hugo, 2026-10-07, audit livraisons § 3.3) : trois clôtures
 * « sans remise » faites au retour, sur la même adresse, suggéreraient le
 * dépôt comme porte.
 */
export const DEPOT_RADIUS_M = 200;

const EARTH_RADIUS_M = 6_371_000;
const DEGREES_TO_RADIANS = Math.PI / 180;

/** La distance entre deux points, en mètres (haversine). */
export function metersBetween(a: GeoPoint, b: GeoPoint): number {
  const dLat = (b.lat - a.lat) * DEGREES_TO_RADIANS;
  const dLng = (b.lng - a.lng) * DEGREES_TO_RADIANS;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * DEGREES_TO_RADIANS) *
      Math.cos(b.lat * DEGREES_TO_RADIANS) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Une position relevée au geste, rattachée à une adresse. */
export interface PointObservation {
  readonly addressId: string;
  /** `door` : une clôture à la porte ; `parking` : une arrivée. */
  readonly kind: AddressPointKind;
  readonly point: GeoPoint;
  readonly accuracyM: number;
}

/** Le point auquel une suggestion se compare, et d'où il vient. */
export interface ReferencePoint {
  readonly point: GeoPoint | null;
  readonly source: AddressPointReference;
}

/** Une suggestion ignorée qui tient encore : son point, pour cette adresse et ce genre. */
export interface IgnoredPoint {
  readonly addressId: string;
  readonly kind: AddressPointKind;
  readonly point: GeoPoint;
}

/** Ce que le calcul rend, avant d'être habillé pour le bureau. */
export interface AddressPointSuggestion {
  readonly addressId: string;
  readonly kind: AddressPointKind;
  readonly suggested: GeoPoint;
  readonly reference: ReferencePoint;
  /** `null` sans point de comparaison. */
  readonly distanceM: number | null;
  readonly concordant: number;
}

/**
 * Le groupe le plus dense : pour chaque position, celles à moins de
 * `CLUSTER_RADIUS_M` ; on garde la plus entourée (la première à égalité,
 * l'ordre d'entrée tranche), et son centre est la moyenne du groupe. `null`
 * si aucun groupe n'atteint `MIN_CONCORDANT`.
 */
export function densestCluster(
  points: readonly GeoPoint[],
): { readonly center: GeoPoint; readonly size: number } | null {
  let best: readonly GeoPoint[] = [];
  for (const seed of points) {
    const near = points.filter((other) => metersBetween(seed, other) <= CLUSTER_RADIUS_M);
    if (near.length > best.length) {
      best = near;
    }
  }
  if (best.length < MIN_CONCORDANT) {
    return null;
  }
  const lat = best.reduce((sum, point) => sum + point.lat, 0) / best.length;
  const lng = best.reduce((sum, point) => sum + point.lng, 0) / best.length;
  return { center: { lat, lng }, size: best.length };
}

/**
 * La suggestion pour UNE adresse et UN genre, ou `null` :
 * - trop peu de positions précises, ou trop dispersées → rien ; une position
 *   à `DEPOT_RADIUS_M` du dépôt ne compte pas (dépôt inconnu : toutes comptent) ;
 * - un centre à `MIN_GAP_M` ou moins du point de comparaison → rien, le
 *   carnet est juste ;
 * - un centre à `CLUSTER_RADIUS_M` d'une suggestion ignorée → rien : la
 *   conclusion n'a pas changé ;
 * - sans point de comparaison, la suggestion naît, distance inconnue.
 */
export function suggestionFor(
  addressId: string,
  kind: AddressPointKind,
  observations: readonly PointObservation[],
  reference: ReferencePoint,
  ignored: readonly IgnoredPoint[],
  depot: GeoPoint | null = null,
): AddressPointSuggestion | null {
  const points = observations
    .filter((seen) => seen.addressId === addressId && seen.kind === kind)
    .filter((seen) => seen.accuracyM <= MAX_ACCURACY_M)
    .filter((seen) => depot === null || metersBetween(seen.point, depot) > DEPOT_RADIUS_M)
    .map((seen) => seen.point);
  const cluster = densestCluster(points);
  if (cluster === null) {
    return null;
  }
  const distanceM =
    reference.point === null ? null : metersBetween(cluster.center, reference.point);
  if (distanceM !== null && distanceM <= MIN_GAP_M) {
    return null;
  }
  const alreadyIgnored = ignored.some(
    (decision) =>
      decision.addressId === addressId &&
      decision.kind === kind &&
      metersBetween(decision.point, cluster.center) <= CLUSTER_RADIUS_M,
  );
  if (alreadyIgnored) {
    return null;
  }
  return {
    addressId,
    kind,
    suggested: cluster.center,
    reference,
    distanceM,
    concordant: cluster.size,
  };
}

/**
 * Le point auquel comparer : pour la **porte**, le point du carnet, sinon le
 * géocodage de l'adresse (ce que la tournée utilise) ; pour le
 * **stationnement**, celui du carnet, sinon la porte — un livreur qui se gare
 * devant la porte n'a pas besoin d'un point de stationnement.
 */
export function referenceFor(
  kind: AddressPointKind,
  carnet: { readonly door: GeoPoint | null; readonly parking: GeoPoint | null },
  geocoded: GeoPoint | null,
): ReferencePoint {
  if (kind === "parking" && carnet.parking !== null) {
    return { point: carnet.parking, source: "carnet" };
  }
  if (carnet.door !== null) {
    return { point: carnet.door, source: "carnet" };
  }
  return geocoded === null
    ? { point: null, source: "none" }
    : { point: geocoded, source: "geocode" };
}

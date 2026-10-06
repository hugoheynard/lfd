import type { RoundRow } from "../domain/ports/delivery-rounds.reader.js";
import type { PlannableStop } from "../domain/services/propose-rounds.js";
import type { GeoPoint } from "../domain/value-objects/geo-point.js";
import { type LocatedStop, routingStopOf } from "./delivery-routing-support.js";

/** L'identifiant du départ dans la matrice : aucun identifiant de commande ne le porte. */
export const DEPOT_ID = "depot";

/**
 * Les arrêts à placer : les commandes à répartir situées et dont la demande
 * en bacs est connue (CA4), puis ceux des tournées recomposables — qui, eux,
 * l'ont toujours (`classifyRounds` garde une tournée dont un arrêt ne l'a pas).
 */
export function poolOf(
  unassigned: readonly string[],
  recomposable: readonly RoundRow[],
  stops: ReadonlyMap<string, LocatedStop>,
  unknownDemand: ReadonlySet<string>,
): readonly PlannableStop[] {
  const plannable = (orderId: string, homeRoundId: string | null): PlannableStop[] => {
    const stop = stops.get(orderId);
    return stop?.point == null || unknownDemand.has(orderId)
      ? []
      : [{ ...routingStopOf(stop), homeRoundId }];
  };
  return [
    ...unassigned.flatMap((orderId) => plannable(orderId, null)),
    ...recomposable.flatMap((round) =>
      round.stops.flatMap((stop) => plannable(stop.orderId, round.id)),
    ),
  ];
}

/** Les commandes à répartir, situées, que la demande inconnue écarte du calcul (CA4). */
export function unknownDemandAmong(
  unassigned: readonly string[],
  stops: ReadonlyMap<string, LocatedStop>,
  unknownDemand: ReadonlySet<string>,
): readonly string[] {
  return unassigned.filter(
    (orderId) => stops.get(orderId)?.point != null && unknownDemand.has(orderId),
  );
}

/** Les points de la matrice : le départ, puis chaque commande située. */
export function pointsOf(
  depot: GeoPoint,
  orderIds: readonly string[],
  stops: ReadonlyMap<string, LocatedStop>,
): ReadonlyMap<string, GeoPoint> {
  const points = new Map<string, GeoPoint>([[DEPOT_ID, depot]]);
  for (const orderId of orderIds) {
    const point = stops.get(orderId)?.point;
    if (point != null) {
      points.set(orderId, point);
    }
  }
  return points;
}

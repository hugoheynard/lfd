import type { DefaultedDemand } from "./proposal-capacity.js";
import type { RoundRow } from "../domain/ports/delivery-rounds.reader.js";
import type { PlannableStop } from "../domain/services/propose-rounds.js";
import type { GeoPoint } from "../domain/value-objects/geo-point.js";
import { type LocatedStop, routingStopOf } from "./delivery-routing-support.js";

/** L'identifiant du départ dans la matrice : aucun identifiant de commande ne le porte. */
export const DEPOT_ID = "depot";

/**
 * Les arrêts à placer : les commandes à répartir situées, puis ceux des
 * tournées recomposables. Une demande en bacs inconnue n'écarte plus personne
 * (décision du 2026-10-06) : la commande est placée sans contrôle de place, et
 * sa tournée est dite « place non vérifiée » (`unknownDemandAmong`).
 */
export function poolOf(
  unassigned: readonly string[],
  recomposable: readonly RoundRow[],
  stops: ReadonlyMap<string, LocatedStop>,
): readonly PlannableStop[] {
  const plannable = (orderId: string, homeRoundId: string | null): PlannableStop[] => {
    const stop = stops.get(orderId);
    return stop?.point == null ? [] : [{ ...routingStopOf(stop), homeRoundId }];
  };
  return [
    ...unassigned.flatMap((orderId) => plannable(orderId, null)),
    ...recomposable.flatMap((round) =>
      round.stops.flatMap((stop) => plannable(stop.orderId, round.id)),
    ),
  ];
}

/**
 * Les commandes considérées dont la demande en bacs est inconnue, dans l'ordre
 * lu et sans doublon : une tournée qui en porte une a sa place NON vérifiée
 * (décision du 2026-10-06) — l'écran le dit, colonne par colonne.
 */
export function unknownDemandAmong(
  orderIds: readonly string[],
  unknownDemand: ReadonlySet<string>,
): readonly string[] {
  return [...new Set(orderIds)].filter((orderId) => unknownDemand.has(orderId));
}

/**
 * Les commandes considérées comptées au contenant par défaut (2026-10-06),
 * dans l'ordre lu et sans doublon, avec ce qu'elles occupent : l'écran le
 * dit « par défaut ».
 */
export function defaultDemandAmong(
  orderIds: readonly string[],
  defaulted: ReadonlyMap<string, DefaultedDemand>,
): readonly (DefaultedDemand & { readonly orderId: string })[] {
  return [...new Set(orderIds)].flatMap((orderId) => {
    const demand = defaulted.get(orderId);
    return demand === undefined ? [] : [{ ...demand, orderId }];
  });
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

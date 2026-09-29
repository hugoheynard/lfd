import type { DeliveryOrderRoundPlaceView } from "@lfd/contracts";

import type {
  DeliveryLoadingReader,
  LoadingRoundRow,
} from "../domain/ports/delivery-loading.reader.js";
import { type FreeHalfRow, freeHalvesAround } from "../domain/services/free-halves.js";

/** Où est une commande, et les moitiés libres des arrêts voisins. */
export interface FreeHalvesOfOrder {
  readonly round: DeliveryOrderRoundPlaceView | null;
  readonly halves: readonly FreeHalfRow[];
}

/**
 * Lit la tournée VIVANTE d'une commande et les moitiés libres de ses arrêts
 * consécutifs (lot 4 bis, v2-4) — partagé par la proposition de colisage et
 * la liste des partenaires. Une tournée partie ne reçoit plus de partage :
 * aucune moitié. Deux lectures : la place, puis la tournée.
 */
export async function freeHalvesOfOrder(
  loading: DeliveryLoadingReader,
  orderId: string,
): Promise<FreeHalvesOfOrder> {
  const place = (await loading.placesOf([orderId])).get(orderId);
  const round = place === undefined ? null : await loading.round(place.roundId);
  const stop = round?.stops.find((candidate) => candidate.orderId === orderId);
  if (round === null || stop === undefined) {
    return { round: null, halves: [] };
  }
  return {
    round: placeView(round, stop.position),
    halves: round.departedAt === null ? freeHalvesAround(round.stops, orderId) : [],
  };
}

function placeView(round: LoadingRoundRow, position: number): DeliveryOrderRoundPlaceView {
  return {
    roundId: round.id,
    day: round.serviceDay,
    vehicleName: round.vehicleName,
    passage: round.passage,
    position,
    departedAt: round.departedAt?.toISOString() ?? null,
  };
}

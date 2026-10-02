import type { DeliveryOrderRoundPlaceView } from "@lfd/contracts";

import type { DeliveryLoadingReader } from "../domain/ports/delivery-loading.reader.js";
import { type FreeHalfRow, freeHalvesAround } from "../domain/services/free-halves.js";
import { orderStopOf, roundPlaceView } from "./order-round-place.js";

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
  const found = await orderStopOf(loading, orderId);
  if (found === null) {
    return { round: null, halves: [] };
  }
  return {
    round: roundPlaceView(found),
    halves: found.round.departedAt === null ? freeHalvesAround(found.round.stops, orderId) : [],
  };
}

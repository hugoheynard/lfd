import type { DeliveryOrderRoundPlaceView } from "@lfd/contracts";

import type {
  DeliveryLoadingReader,
  LoadingRoundRow,
  LoadingStopRow,
} from "../domain/ports/delivery-loading.reader.js";

/** La tournée vivante d'une commande, et son arrêt dedans. */
export interface OrderStop {
  readonly round: LoadingRoundRow;
  readonly stop: LoadingStopRow;
}

/**
 * Lit la tournée VIVANTE d'une commande et son arrêt — deux lectures : la
 * place, puis la tournée. `null` : la commande n'est dans aucune tournée.
 * Partagé par les moitiés libres (v2-4) et l'étiquette du bac (lot PC3).
 */
export async function orderStopOf(
  loading: DeliveryLoadingReader,
  orderId: string,
): Promise<OrderStop | null> {
  const place = (await loading.placesOf([orderId])).get(orderId);
  const round = place === undefined ? null : await loading.round(place.roundId);
  const stop = round?.stops.find((candidate) => candidate.orderId === orderId);
  return round === null || stop === undefined ? null : { round, stop };
}

/** Où est la commande, dit pour l'écran : la tournée, et la position de l'arrêt. */
export function roundPlaceView(found: OrderStop | null): DeliveryOrderRoundPlaceView | null {
  if (found === null) {
    return null;
  }
  const { round, stop } = found;
  return {
    roundId: round.id,
    day: round.serviceDay,
    vehicleName: round.vehicleName,
    passage: round.passage,
    position: stop.position,
    departedAt: round.departedAt?.toISOString() ?? null,
  };
}

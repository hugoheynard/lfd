import type { PlaceShopOrderPayload } from "@lfd/contracts";

import {
  PlaceShopOrderCommand,
  type PlaceShopOrderResult,
} from "../src/b2b/orders/application/commands/place-shop-order.command.js";
import type { PlaceShopOrderHandler } from "../src/b2b/orders/application/commands/place-shop-order.handler.js";
import { OrderTotalChangedError } from "../src/b2b/orders/domain/errors/order-total-changed.error.js";

/** Un payload de passation dont le total vu est laissé à la confirmation. */
export type Unseen<T extends { readonly expectedTotalCents: number }> = Omit<
  T,
  "expectedTotalCents"
> & { readonly expectedTotalCents?: number };

/** Un total qu'aucune commande n'atteint : la tentative est refusée, et nomme le vrai. */
const UNSEEN_TOTAL_CENTS = Number.MAX_SAFE_INTEGER;

/**
 * La passation de la boutique **hors requête**, au total qu'elle compose —
 * le pendant de `seen-total-agent.ts` pour les suites qui appellent le
 * handler sans HTTP (lot T3, `plan-total-vu.md`).
 *
 * Un payload qui porte déjà son total part tel quel ; sinon, une tentative à
 * un total inatteignable est refusée `orders.total_changed` sans rien écrire
 * (le porteur invité excepté, inscrit avant la composition), et la vraie
 * passation part au total que le refus a nommé.
 */
export async function placeShopOrderSeeingTotal(
  handler: PlaceShopOrderHandler,
  payload: Unseen<PlaceShopOrderPayload>,
): Promise<PlaceShopOrderResult> {
  const given = payload.expectedTotalCents;
  return seeingTotal(given, (expectedTotalCents) =>
    handler.execute(new PlaceShopOrderCommand({ ...payload, expectedTotalCents })),
  );
}

/**
 * Le même geste pour n'importe quelle passation hors requête : `attempt`
 * passe la commande au total donné. Un total déjà connu part tel quel.
 */
export async function seeingTotal<R>(
  given: number | undefined,
  attempt: (expectedTotalCents: number) => Promise<R>,
): Promise<R> {
  if (given !== undefined) {
    return attempt(given);
  }
  try {
    return await attempt(UNSEEN_TOTAL_CENTS);
  } catch (error) {
    if (error instanceof OrderTotalChangedError) {
      return attempt(error.totalCents);
    }
    throw error;
  }
}

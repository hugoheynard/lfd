import { ACTIVITY_TYPES } from "./activity-event.js";

/** Le minimum qu'un fait du journal expose pour être reconnu comme une commande. */
export interface OrderFactLike {
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * Retire des faits `order.placed` ceux d'une **tentative de carte abandonnée**
 * (décidé par Hugo le 2026-11-13) : elle n'est pas une commande, et ne compte
 * ni en acquisition, ni en cohorte, ni en concentration, ni au tunnel.
 *
 * Le fait reste au journal, intact : c'est la LECTURE qui l'écarte, d'après
 * l'état de la commande aujourd'hui. Les faits `order.abandoned` passent — la
 * mesure de l'abandon reste entière.
 */
export function withoutAbandonedAttempts<T extends OrderFactLike>(
  events: readonly T[],
  abandonedOrderIds: ReadonlySet<string>,
): T[] {
  return events.filter(
    (event) =>
      event.type !== ACTIVITY_TYPES.orderPlaced || !abandonedOrderIds.has(orderIdOf(event)),
  );
}

function orderIdOf(event: OrderFactLike): string {
  const orderId = event.payload["orderId"];
  return typeof orderId === "string" ? orderId : "";
}

import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { OrderNoShowPayloadError } from "../errors/order-no-show-errors.js";

/** Nom STABLE du fait, clé de routage vers `@DurableHandler`. */
export const ORDER_NO_SHOW = "order.no_show";

/**
 * **Le client n'est pas venu retirer sa commande** — fait DURABLE, écrit par
 * `DeclareOrderNoShowHandler` dans l'unité de travail qui pose `no_show`.
 * Abonné : le journal (`order.no_show`). Aucun e-mail : prévenir le client est
 * un geste distinct, décidé par la supervision.
 *
 * Clé `order.no_show:<orderId>` : une commande ne se déclare qu'une fois.
 */
export class OrderNoShowFact implements DurableEvent {
  constructor(
    readonly orderId: string,
    readonly orderNumber: string,
    readonly placedByUserId: string,
    /** L'id de la FICHE staff qui l'a déclarée. */
    readonly noShowBy: string,
    readonly noShowAt: Date,
  ) {}

  durableFact(): DurableFact {
    return {
      type: ORDER_NO_SHOW,
      key: `${ORDER_NO_SHOW}:${this.orderId}`,
      payload: {
        orderId: this.orderId,
        orderNumber: this.orderNumber,
        placedByUserId: this.placedByUserId,
        noShowBy: this.noShowBy,
        noShowAt: this.noShowAt.toISOString(),
      },
    };
  }

  /** @throws {OrderNoShowPayloadError} payload hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): OrderNoShowFact {
    const { orderId, orderNumber, placedByUserId, noShowBy, noShowAt } = payload;
    if (
      !isFilled(orderId) ||
      !isFilled(orderNumber) ||
      !isFilled(placedByUserId) ||
      !isFilled(noShowBy) ||
      !isFilled(noShowAt) ||
      Number.isNaN(Date.parse(noShowAt))
    ) {
      throw new OrderNoShowPayloadError();
    }
    return new OrderNoShowFact(orderId, orderNumber, placedByUserId, noShowBy, new Date(noShowAt));
  }
}

function isFilled(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

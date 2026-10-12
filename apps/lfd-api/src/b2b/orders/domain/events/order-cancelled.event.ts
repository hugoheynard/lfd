import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { OrderSettlementPayloadError } from "../errors/order-settlement-payload.error.js";
import type { CancellableRegime } from "../services/order-cancellation.js";

/** Nom STABLE du fait, clé de routage vers `@DurableHandler`. */
export const ORDER_CANCELLED = "order.cancelled";

/**
 * Fait de domaine : **l'équipe a annulé une commande** (plan
 * `documentation/order/plan-annulation-de-commande.md`, C3.5, 2026-10-12).
 *
 * Durable, écrit dans l'unité de travail qui annule : l'annulation, le bon
 * rendu et ce fait partent ensemble, ou rien. Publié une fois, au
 * franchissement — un rejeu de transaction ou un second clic ne franchit pas.
 * Clé `order.cancelled:<orderId>` : une commande ne s'annule qu'une fois.
 *
 * Abonnés : le journal (`order.cancelled`) et le courriel au client.
 *
 * Le motif voyage avec le fait pour le journal ; le courriel ne le lit pas.
 */
export class OrderCancelledEvent implements DurableEvent {
  constructor(
    readonly orderId: string,
    readonly orderNumber: string,
    /** Le client — le sujet du témoin au journal. */
    readonly placedByUserId: string,
    /** La fiche staff qui a annulé — jamais un `sub`. */
    readonly cancelledBy: string,
    readonly reason: string,
    readonly regime: CancellableRegime,
    readonly voucherReturned: boolean,
  ) {}

  durableFact(): DurableFact {
    return {
      type: ORDER_CANCELLED,
      key: `${ORDER_CANCELLED}:${this.orderId}`,
      payload: {
        orderId: this.orderId,
        orderNumber: this.orderNumber,
        placedByUserId: this.placedByUserId,
        cancelledBy: this.cancelledBy,
        reason: this.reason,
        regime: this.regime,
        voucherReturned: this.voucherReturned,
      },
    };
  }

  /** @throws {OrderSettlementPayloadError} payload hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): OrderCancelledEvent {
    const text = (key: string): string | null => {
      const value = payload[key];
      return typeof value === "string" && value.length > 0 ? value : null;
    };
    const orderId = text("orderId");
    const orderNumber = text("orderNumber");
    const placedByUserId = text("placedByUserId");
    const cancelledBy = text("cancelledBy");
    const reason = text("reason");
    const regime = payload["regime"];
    const voucherReturned = payload["voucherReturned"];
    if (
      orderId === null ||
      orderNumber === null ||
      placedByUserId === null ||
      cancelledBy === null ||
      reason === null ||
      (regime !== "free" && regime !== "due") ||
      typeof voucherReturned !== "boolean"
    ) {
      throw new OrderSettlementPayloadError(ORDER_CANCELLED);
    }
    return new OrderCancelledEvent(
      orderId,
      orderNumber,
      placedByUserId,
      cancelledBy,
      reason,
      regime,
      voucherReturned,
    );
  }
}

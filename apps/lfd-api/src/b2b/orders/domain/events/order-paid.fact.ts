import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { OrderSettlementPayloadError } from "../errors/order-settlement-payload.error.js";

/** Nom STABLE du fait, clé de routage vers `@DurableHandler`. */
export const ORDER_PAID = "order.paid";

/**
 * **Une commande vient d'être encaissée par carte** — fait DURABLE, écrit
 * dans la transaction qui la passe `paid` (lot E5a du plan
 * `documentation/comptabilite/facturation/plan-facture-carte-et-remboursements.md`,
 * § 2 bis-1).
 *
 * Pourquoi un fait durable à côté de `OrderPaymentSettledEvent`, qui reste en
 * mémoire pour l'accusé de réception : la facture carte naît quand la commande
 * est retirée ET payée, dans l'ordre qu'on voudra. Un encaissement qui arrive
 * après le retrait est le SEUL signal qui la fait émettre ; le perdre sur un
 * redémarrage laisserait une vente sans facture, que rien ne rattraperait.
 *
 * Écrit seulement au franchissement (`markPaid` rend un id) : un webhook
 * rejoué n'en écrit pas un second. Clé `order.paid:<orderId>` : une commande
 * n'est encaissée qu'une fois.
 */
export class OrderPaidFact implements DurableEvent {
  constructor(readonly orderId: string) {}

  durableFact(): DurableFact {
    return {
      type: ORDER_PAID,
      key: `${ORDER_PAID}:${this.orderId}`,
      payload: { orderId: this.orderId },
    };
  }

  /** @throws {OrderSettlementPayloadError} payload hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): OrderPaidFact {
    const orderId = payload["orderId"];
    if (typeof orderId !== "string" || orderId.length === 0) {
      throw new OrderSettlementPayloadError(ORDER_PAID);
    }
    return new OrderPaidFact(orderId);
  }
}

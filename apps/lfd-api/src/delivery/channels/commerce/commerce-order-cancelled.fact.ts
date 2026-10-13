import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const COMMERCE_ORDER_CANCELLED = "commerce.order_cancelled";

/**
 * **« Une commande vient d'être annulée »** — ce que la livraison DÉCLARE et
 * que le commerce ÉCRIT dans la boîte d'envoi, dans la transaction de
 * l'annulation (plan du transfert interne, lot T2, décision 4 de Hugo du
 * 2026-10-13) : une commande annulée sort de son transfert prévu.
 *
 * Même figure que `CommerceOrderPlacedFact`, et pour la même raison : les faits
 * d'annulation du commerce (`order.cancelled`, `order.payment_failed`) vivent
 * dans `b2b/orders/domain/`, que la livraison ne peut pas lire (`delivery →
 * b2b` est interdit). Le fait vit donc dans SON canal. Il est écrit par TOUS
 * les chemins qui posent `cancelled` (vérifié le 2026-10-13) : l'annulation
 * (équipe, client, invité), l'abandon du règlement, l'expiration d'une
 * commande boutique non réglée (et son remplacement), la clôture qui coupe un
 * règlement en l'air.
 *
 * `{ orderId }`, rien d'autre : la livraison relit la commande par son canal.
 * Clé `commerce.order_cancelled:<orderId>` : une commande ne s'annule qu'une fois.
 */
export class CommerceOrderCancelledFact implements DurableEvent {
  constructor(readonly orderId: string) {}

  durableFact(): DurableFact {
    return {
      type: COMMERCE_ORDER_CANCELLED,
      key: `${COMMERCE_ORDER_CANCELLED}:${this.orderId}`,
      payload: { orderId: this.orderId },
    };
  }

  /** @throws {CommerceOrderCancelledPayloadError} un fait sans identifiant de commande. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): CommerceOrderCancelledFact {
    const orderId = payload["orderId"];
    if (typeof orderId !== "string" || orderId.length === 0) {
      throw new CommerceOrderCancelledPayloadError();
    }
    return new CommerceOrderCancelledFact(orderId);
  }
}

/** Un fait « commande annulée » illisible : rien n'est retiré, le message reste visible. */
export class CommerceOrderCancelledPayloadError extends TechnicalError {
  constructor() {
    super(
      "commerce_order_cancelled.payload_invalid",
      "Le fait « commande annulée » reçu par la livraison est illisible (commande manquante) : " +
        "elle n'a pas été retirée de son transfert interne. Le message reste dans la boîte " +
        "d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}

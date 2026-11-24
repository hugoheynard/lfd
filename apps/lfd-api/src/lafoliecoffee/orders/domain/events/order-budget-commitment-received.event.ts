import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";

/** Nom stable du fait — une valeur écrite : elle ne se renomme que par migration. */
export const ORDER_BUDGET_COMMITMENT_RECEIVED = "order.budget_commitment_received";

/**
 * **« Le numéro d'engagement de la commande est arrivé sur son devis de
 * période »** (QD6, plan `plan-clients-publics-chorus.md`, § 6 sexies) —
 * écrit dans la boîte d'envoi, dans la transaction de « Engagement reçu »,
 * une fois par commande. Clé `…:<orderId>:<quoteId>` : une commande ne
 * reçoit son numéro qu'une fois par devis.
 */
export class OrderBudgetCommitmentReceivedEvent implements DurableEvent {
  constructor(
    readonly orderId: string,
    readonly orderNumber: string,
    readonly placedByUserId: string,
    readonly receivedByStaffId: string,
    readonly quote: { readonly id: string; readonly number: string },
    readonly commitment: { readonly number: string; readonly serviceCode: string },
  ) {}

  durableFact(): DurableFact {
    return {
      type: ORDER_BUDGET_COMMITMENT_RECEIVED,
      key: `${ORDER_BUDGET_COMMITMENT_RECEIVED}:${this.orderId}:${this.quote.id}`,
      payload: {
        orderId: this.orderId,
        orderNumber: this.orderNumber,
        placedByUserId: this.placedByUserId,
        receivedByStaffId: this.receivedByStaffId,
        quoteId: this.quote.id,
        quoteNumber: this.quote.number,
        commitment: this.commitment,
      },
    };
  }
}

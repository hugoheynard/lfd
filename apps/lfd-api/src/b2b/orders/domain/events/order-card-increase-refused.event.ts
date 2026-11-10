import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { OrderSettlementPayloadError } from "../errors/order-settlement-payload.error.js";

/** Nom STABLE du fait, clé de routage vers `@DurableHandler`. */
export const ORDER_CARD_INCREASE_REFUSED = "order.card_increase_refused";

/**
 * Fait de domaine : **une hausse payée ne peut plus s'appliquer** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, §2.6 étape 4)
 * — le projet est `refused`, la commande garde son total, et le complément
 * encaissé n'est pas à nous.
 *
 * Publié dans la transaction qui écrit le refus ; l'abonné
 * `RefundRefusedIncrease` rend le complément en ajustement (R8, R11) et
 * prévient le client. Jamais publié par l'annulation de la commande (R9) :
 * elle rend tout elle-même. Clé : le projet — un rejeu ne le publie pas deux fois.
 */
export class OrderCardIncreaseRefusedEvent implements DurableEvent {
  constructor(
    readonly orderId: string,
    readonly proposalId: string,
    readonly paymentId: string,
    readonly complementCents: number,
    readonly refusal: string,
  ) {}

  durableFact(): DurableFact {
    return {
      type: ORDER_CARD_INCREASE_REFUSED,
      key: `${ORDER_CARD_INCREASE_REFUSED}:${this.proposalId}`,
      payload: {
        orderId: this.orderId,
        proposalId: this.proposalId,
        paymentId: this.paymentId,
        complementCents: this.complementCents,
        refusal: this.refusal,
      },
    };
  }

  /** @throws {OrderSettlementPayloadError} payload hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): OrderCardIncreaseRefusedEvent {
    const { orderId, proposalId, paymentId, complementCents, refusal } = payload;
    if (
      typeof orderId !== "string" ||
      typeof proposalId !== "string" ||
      typeof paymentId !== "string" ||
      typeof refusal !== "string" ||
      typeof complementCents !== "number" ||
      !Number.isInteger(complementCents) ||
      complementCents <= 0
    ) {
      throw new OrderSettlementPayloadError(ORDER_CARD_INCREASE_REFUSED);
    }
    return new OrderCardIncreaseRefusedEvent(
      orderId,
      proposalId,
      paymentId,
      complementCents,
      refusal,
    );
  }
}

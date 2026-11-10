import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { OrderSettlementPayloadError } from "../errors/order-settlement-payload.error.js";

/** Nom STABLE du fait, clé de routage vers `@DurableHandler`. */
export const ORDER_COMPLEMENT_PAID_LATE = "order.complement_paid_late";

/**
 * Fait de domaine : **le complément d'un projet abandonné a été encaissé**
 * (plan `documentation/commandes/modification/plan-s2-la-hausse.md`, §2.5) —
 * de l'argent reçu pour une modification qui ne sera pas faite.
 *
 * Publié DANS la transaction du webhook, quand le paiement n'est pas encore
 * `paid` pour le bloc des cartes : le remboursement ne peut pas partir là
 * (`requestAmount` le refuserait). L'abonné `RefundLateComplement` (lot S2.c)
 * le rendra après validation, en ajustement (R8). Clé : le projet — un rejeu
 * ne le publie pas deux fois.
 */
export class OrderComplementPaidLateEvent implements DurableEvent {
  constructor(
    readonly orderId: string,
    readonly proposalId: string,
    readonly paymentId: string,
    readonly complementCents: number,
  ) {}

  durableFact(): DurableFact {
    return {
      type: ORDER_COMPLEMENT_PAID_LATE,
      key: `${ORDER_COMPLEMENT_PAID_LATE}:${this.proposalId}`,
      payload: {
        orderId: this.orderId,
        proposalId: this.proposalId,
        paymentId: this.paymentId,
        complementCents: this.complementCents,
      },
    };
  }

  /** @throws {OrderSettlementPayloadError} payload hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): OrderComplementPaidLateEvent {
    const { orderId, proposalId, paymentId, complementCents } = payload;
    if (
      typeof orderId !== "string" ||
      typeof proposalId !== "string" ||
      typeof paymentId !== "string" ||
      typeof complementCents !== "number" ||
      !Number.isInteger(complementCents) ||
      complementCents <= 0
    ) {
      throw new OrderSettlementPayloadError(ORDER_COMPLEMENT_PAID_LATE);
    }
    return new OrderComplementPaidLateEvent(orderId, proposalId, paymentId, complementCents);
  }
}

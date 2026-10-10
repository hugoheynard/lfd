import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { OrderSettlementPayloadError } from "../errors/order-settlement-payload.error.js";

/** Nom STABLE du fait, clé de routage vers `@DurableHandler`. */
export const ORDER_PAID_AFTER_CANCELLATION = "order.paid_after_cancellation";

/**
 * Fait de domaine : **une carte a été encaissée sur une commande annulée** —
 * de l'argent reçu pour une commande que personne ne produira (plan
 * `documentation/order/plan-abandon-du-reglement.md`, lot 6 bis, B1).
 *
 * La clôture annule une commande même quand Stripe n'a pas confirmé la mort
 * de son intention : une panne ne doit pas arrêter le fournil. Le prix en est
 * ce cas-ci — une intention restée vivante que le client finit de payer. La
 * base ne rouvre jamais l'annulée ; ce fait existe pour que quelqu'un
 * rembourse.
 *
 * Écrit à chaque webhook d'encaissement qui trouve la commande annulée : un
 * rejeu le réécrit, et c'est la clé du fait — `order.paid_after_cancellation:<orderId>`,
 * celle de la cloche — qui dédoublonne.
 *
 * 🔴 **Durable depuis le 2026-10-10 (lot E4b)**
 * (`documentation/journalisation/plan-evenements-durables.md`). En mémoire, un
 * redémarrage entre l'accusé du webhook et le saut perdait la cloche « à
 * rembourser » — et Stripe ne rejoue qu'un webhook NON accusé : de l'argent
 * gardé sans que personne le sache.
 */
export class OrderPaidAfterCancellationEvent implements DurableEvent {
  constructor(readonly orderId: string) {}

  durableFact(): DurableFact {
    return {
      type: ORDER_PAID_AFTER_CANCELLATION,
      key: `${ORDER_PAID_AFTER_CANCELLATION}:${this.orderId}`,
      payload: { orderId: this.orderId },
    };
  }

  /** @throws {OrderSettlementPayloadError} payload hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): OrderPaidAfterCancellationEvent {
    const orderId = payload["orderId"];
    if (typeof orderId !== "string" || orderId.length === 0) {
      throw new OrderSettlementPayloadError(ORDER_PAID_AFTER_CANCELLATION);
    }
    return new OrderPaidAfterCancellationEvent(orderId);
  }
}

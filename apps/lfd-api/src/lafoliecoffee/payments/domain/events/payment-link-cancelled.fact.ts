import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { PaymentLinkFactPayloadError } from "../errors/payment-link-errors.js";

/** Nom STABLE du fait, clé de routage vers `@DurableHandler`. */
export const PAYMENT_LINK_CANCELLED_FACT = "payment_link.cancelled";

/**
 * Fait durable : **une demande de paiement libre payée par la porte a été annulée** (plan
 * du lien vers un sujet, §5.3 et §5.6). Écrit dans la transaction de
 * l'annulation, avec la révocation de son lien : l'abonné qui annule
 * l'intention chez le prestataire est rejoué par la boîte d'envoi tant qu'il
 * échoue — un appel réseau ne se fait pas dans la transaction, et une panne
 * après elle ne doit pas laisser une page encore payable.
 *
 * Un lien d'avant la porte ne l'émet pas : il n'a pas d'intention, il ferme
 * sa session Stripe.
 */
export class PaymentLinkCancelledFact implements DurableEvent {
  constructor(readonly paymentLinkId: string) {}

  durableFact(): DurableFact {
    return {
      type: PAYMENT_LINK_CANCELLED_FACT,
      key: `${PAYMENT_LINK_CANCELLED_FACT}:${this.paymentLinkId}`,
      payload: { paymentLinkId: this.paymentLinkId },
    };
  }

  /** @throws {PaymentLinkFactPayloadError} payload hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): PaymentLinkCancelledFact {
    const id = payload["paymentLinkId"];
    if (typeof id !== "string" || id.length === 0) {
      throw new PaymentLinkFactPayloadError(PAYMENT_LINK_CANCELLED_FACT);
    }
    return new PaymentLinkCancelledFact(id);
  }
}

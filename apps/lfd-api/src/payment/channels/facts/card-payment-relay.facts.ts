import { CARD_REFUND_STATUSES } from "../../card/domain/ports/card-provider-types.js";
import type { CardRefundStatus } from "../../card/domain/ports/card-provider-types.js";
import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { cents, instant, oneOf, optionalRecord, optionalText, text } from "./fact-payload.js";

/** Noms STABLES, clés de routage vers `@DurableHandler`. */
export const CARD_PAYMENT_UNMATCHED = "card_payment.unmatched";

/**
 * Un remboursement annoncé par le prestataire, réduit — ce que `lafoliecoffee/payments`
 * lit d'un remboursement hors de nos sujets (`card_payment.unmatched`), sous
 * des noms agnostiques.
 */
export interface ProviderRefund {
  readonly refundId: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly status: CardRefundStatus;
  readonly refundedAt: Date;
}

function refundPayload(refund: ProviderRefund): Record<string, unknown> {
  return {
    refundId: refund.refundId,
    amountCents: refund.amountCents,
    currency: refund.currency,
    status: refund.status,
    refundedAt: refund.refundedAt.toISOString(),
  };
}

function refundOf(payload: Readonly<Record<string, unknown>>, type: string): ProviderRefund {
  return {
    refundId: text(payload, type, "refundId"),
    amountCents: cents(payload, type, "amountCents"),
    currency: text(payload, type, "currency"),
    status: oneOf(payload, type, "status", CARD_REFUND_STATUSES),
    refundedAt: instant(payload, type, "refundedAt"),
  };
}

/**
 * **Un événement hors de nos sujets** (plan M2, §3.3) — avec son type :
 * aucune ligne ne porte son intention et aucun sujet ne la revendique, ou il
 * ne parle d'aucune intention. Pas une anomalie en soi : `lafoliecoffee/payments`
 * l'écoute et ne sonne que sur un remboursement (`refund` non nul), comme
 * `OnRefundWithoutOrder` aujourd'hui.
 *
 * Clé `…:<compte>:<eventId>` : un rejeu du prestataire ne s'écrit qu'une fois.
 */
export class CardPaymentUnmatchedFact implements DurableEvent {
  constructor(
    readonly account: string,
    readonly eventId: string,
    readonly eventType: string,
    readonly providerRef: string | null,
    readonly refund: ProviderRefund | null,
  ) {}

  durableFact(): DurableFact {
    const type = CARD_PAYMENT_UNMATCHED;
    return {
      type,
      key: `${type}:${this.account}:${this.eventId}`,
      payload: {
        account: this.account,
        eventId: this.eventId,
        eventType: this.eventType,
        providerRef: this.providerRef,
        refund: this.refund === null ? null : refundPayload(this.refund),
      },
    };
  }

  /** @throws {CardPaymentFactPayloadError} charge hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): CardPaymentUnmatchedFact {
    const type = CARD_PAYMENT_UNMATCHED;
    const refund = optionalRecord(payload, type, "refund");
    return new CardPaymentUnmatchedFact(
      text(payload, type, "account"),
      text(payload, type, "eventId"),
      text(payload, type, "eventType"),
      optionalText(payload, type, "providerRef"),
      refund === null ? null : refundOf(refund, type),
    );
  }
}

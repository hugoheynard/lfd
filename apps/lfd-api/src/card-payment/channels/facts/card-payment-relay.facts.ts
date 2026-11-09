import { CARD_REFUND_STATUSES } from "../../domain/ports/card-provider-types.js";
import type { CardRefundStatus } from "../../domain/ports/card-provider-types.js";
import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { cents, instant, oneOf, optionalRecord, optionalText, text } from "./fact-payload.js";

/** Noms STABLES, clés de routage vers `@DurableHandler`. */
export const CARD_PAYMENT_PROVIDER_REFUND_EVENT = "card_payment.provider_refund_event";
export const CARD_PAYMENT_CHECKOUT_EVENT = "card_payment.checkout_event";
export const CARD_PAYMENT_UNMATCHED = "card_payment.unmatched";

/**
 * Un remboursement annoncé par le prestataire, réduit — exactement ce que
 * `RecordOrderRefundCommand` lit aujourd'hui (`stripeRefundId`, montant,
 * devise, statut, instant ; vérifié le 2026-11-09), sous des noms agnostiques.
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
 * **Un remboursement d'un paiement connu** — fait DURABLE et **transitoire**
 * (plan M2, §4.2 ; posé le 2026-11-09, retiré en P1) : en P0, le constat du
 * remboursement reste à `b2b/orders`, qui s'y abonne et appelle
 * `RecordOrderRefundCommand` — rien ne change de type.
 *
 * Clé `…:<compte>:<eventId>` : un même événement rejoué par le prestataire ne
 * s'écrit qu'une fois ; deux événements d'un même remboursement (`created`,
 * puis `updated`) sont deux faits, chacun avec son statut.
 */
export class CardPaymentProviderRefundEvent implements DurableEvent {
  constructor(
    readonly account: string,
    readonly eventId: string,
    readonly paymentId: string,
    readonly providerRef: string,
    readonly subjectType: string,
    readonly subjectId: string,
    readonly refund: ProviderRefund,
  ) {}

  durableFact(): DurableFact {
    const type = CARD_PAYMENT_PROVIDER_REFUND_EVENT;
    return {
      type,
      key: `${type}:${this.account}:${this.eventId}`,
      payload: {
        account: this.account,
        eventId: this.eventId,
        paymentId: this.paymentId,
        providerRef: this.providerRef,
        subjectType: this.subjectType,
        subjectId: this.subjectId,
        ...refundPayload(this.refund),
      },
    };
  }

  /** @throws {CardPaymentFactPayloadError} charge hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): CardPaymentProviderRefundEvent {
    const type = CARD_PAYMENT_PROVIDER_REFUND_EVENT;
    return new CardPaymentProviderRefundEvent(
      text(payload, type, "account"),
      text(payload, type, "eventId"),
      text(payload, type, "paymentId"),
      text(payload, type, "providerRef"),
      text(payload, type, "subjectType"),
      text(payload, type, "subjectId"),
      refundOf(payload, type),
    );
  }
}

/** L'issue d'une page hébergée de lien de paiement. */
export type CheckoutOutcome = "paid" | "expired";
const CHECKOUT_OUTCOMES: readonly CheckoutOutcome[] = ["paid", "expired"];

/**
 * **Le relais des liens de paiement** — fait DURABLE et **transitoire** (plan
 * M2, §4.5 ; retiré en P2) : tant que l'endpoint propre des liens ne reçoit
 * pas les `checkout.session.*`, celui des cartes les relaie à `b2b/payments`
 * — jamais un 200 muet. La charge est ce que `SettlePaymentLinkCommand`
 * (`paid`) et `ExpirePaymentLinkCommand` (`expired`) lisent : l'id de session.
 */
export class CardPaymentCheckoutEvent implements DurableEvent {
  constructor(
    readonly account: string,
    readonly eventId: string,
    readonly eventType: string,
    readonly outcome: CheckoutOutcome,
    readonly sessionId: string,
  ) {}

  durableFact(): DurableFact {
    const type = CARD_PAYMENT_CHECKOUT_EVENT;
    return {
      type,
      key: `${type}:${this.account}:${this.eventId}`,
      payload: {
        account: this.account,
        eventId: this.eventId,
        eventType: this.eventType,
        outcome: this.outcome,
        sessionId: this.sessionId,
      },
    };
  }

  /** @throws {CardPaymentFactPayloadError} charge hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): CardPaymentCheckoutEvent {
    const type = CARD_PAYMENT_CHECKOUT_EVENT;
    return new CardPaymentCheckoutEvent(
      text(payload, type, "account"),
      text(payload, type, "eventId"),
      text(payload, type, "eventType"),
      oneOf(payload, type, "outcome", CHECKOUT_OUTCOMES),
      text(payload, type, "sessionId"),
    );
  }
}

/**
 * **Un événement hors de nos sujets** (plan M2, §3.3) — avec son type :
 * aucune ligne ne porte son intention et aucun sujet ne la revendique, ou il
 * ne parle d'aucune intention. Pas une anomalie en soi : `b2b/payments`
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

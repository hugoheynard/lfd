import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import {
  CARD_REFUND_NATURES,
  type CardRefundNature,
} from "../../domain/value-objects/card-refund-values.js";
import { cents, oneOf, optionalText, text } from "./fact-payload.js";

/** Noms STABLES, clés de routage vers `@DurableHandler` (plan M2, §3.3). */
export const CARD_PAYMENT_REFUND_SUCCEEDED = "card_payment.refund_succeeded";
export const CARD_PAYMENT_REFUND_FAILED = "card_payment.refund_failed";
export const CARD_PAYMENT_REFUND_REVERSED = "card_payment.refund_reversed";
export const CARD_PAYMENT_FULLY_REFUNDED = "card_payment.fully_refunded";

/** Les trois faits d'une ligne du carnet qui change de sort. */
export type CardPaymentRefundFactType =
  | typeof CARD_PAYMENT_REFUND_SUCCEEDED
  | typeof CARD_PAYMENT_REFUND_FAILED
  | typeof CARD_PAYMENT_REFUND_REVERSED;

/** Ce que les faits de remboursement disent : le sujet, le paiement, la ligne du carnet. */
export interface CardRefundFactSubject {
  readonly subjectType: string;
  readonly subjectId: string;
  readonly paymentId: string;
  /** L'id de la ligne `card_payment.refund` — jamais le `re_…` du prestataire. */
  readonly refundId: string;
  readonly requestId: string | null;
  readonly nature: CardRefundNature | null;
  readonly amountCents: number;
}

/**
 * **Un remboursement a réussi, a échoué, ou a été inversé** — fait DURABLE
 * de `card-payment`, écrit dans la transaction qui l'écrit au carnet, AVANT
 * l'appel au canal (§3.6). `refund_succeeded` part aussi d'un « rendu
 * autrement » (§5.5). Clé `<type>:<refundId>` : chaque sort ne se franchit
 * qu'une fois par ligne (`succeeded` ne revient pas, `failed` est terminal).
 */
export class CardPaymentRefundFact implements DurableEvent {
  constructor(
    readonly type: CardPaymentRefundFactType,
    readonly refund: CardRefundFactSubject,
  ) {}

  durableFact(): DurableFact {
    return {
      type: this.type,
      key: `${this.type}:${this.refund.refundId}`,
      payload: { ...this.refund },
    };
  }

  /** @throws {CardPaymentFactPayloadError} charge hors forme — faute d'émetteur. */
  static fromPayload(
    type: CardPaymentRefundFactType,
    payload: Readonly<Record<string, unknown>>,
  ): CardPaymentRefundFact {
    const nature = optionalText(payload, type, "nature");
    return new CardPaymentRefundFact(type, {
      subjectType: text(payload, type, "subjectType"),
      subjectId: text(payload, type, "subjectId"),
      paymentId: text(payload, type, "paymentId"),
      refundId: text(payload, type, "refundId"),
      requestId: optionalText(payload, type, "requestId"),
      nature: nature === null ? null : oneOf({ nature }, type, "nature", CARD_REFUND_NATURES),
      amountCents: cents(payload, type, "amountCents"),
    });
  }
}

/**
 * **Le remboursé atteint l'encaissé** d'un sujet — fait DURABLE, écrit avec
 * le remboursement qui l'y fait arriver. Clé
 * `card_payment.fully_refunded:<type>:<id>:<refundId>` : une inversion puis un
 * second remboursement complet est un second fait, pas un rejeu.
 */
export class CardPaymentFullyRefundedFact implements DurableEvent {
  constructor(
    readonly subjectType: string,
    readonly subjectId: string,
    readonly refundId: string,
    readonly refundedCents: number,
  ) {}

  durableFact(): DurableFact {
    const type = CARD_PAYMENT_FULLY_REFUNDED;
    return {
      type,
      key: `${type}:${this.subjectType}:${this.subjectId}:${this.refundId}`,
      payload: {
        subjectType: this.subjectType,
        subjectId: this.subjectId,
        refundId: this.refundId,
        refundedCents: this.refundedCents,
      },
    };
  }

  /** @throws {CardPaymentFactPayloadError} charge hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): CardPaymentFullyRefundedFact {
    const type = CARD_PAYMENT_FULLY_REFUNDED;
    return new CardPaymentFullyRefundedFact(
      text(payload, type, "subjectType"),
      text(payload, type, "subjectId"),
      text(payload, type, "refundId"),
      cents(payload, type, "refundedCents"),
    );
  }
}

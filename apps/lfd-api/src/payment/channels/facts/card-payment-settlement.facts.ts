import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import type { SubjectPaidOutcome, SubjectPaymentRole } from "../subjects/index.js";
import { cents, instant, oneOf, text } from "./fact-payload.js";

/** Noms STABLES, clés de routage vers `@DurableHandler`. */
export const CARD_PAYMENT_SETTLED = "card_payment.settled";
export const CARD_PAYMENT_FAILED = "card_payment.failed";

const OUTCOMES: readonly SubjectPaidOutcome[] = ["applied", "refused", "already_applied"];
const ROLES: readonly SubjectPaymentRole[] = ["first", "complement"];

/** Ce que les deux faits disent du paiement. */
export interface CardPaymentFactSubject {
  readonly paymentId: string;
  readonly account: string;
  readonly providerRef: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly role: SubjectPaymentRole;
  readonly amountCents: number;
}

function paymentPayload(payment: CardPaymentFactSubject): Record<string, unknown> {
  return { ...payment };
}

function paymentOf(
  payload: Readonly<Record<string, unknown>>,
  type: string,
): CardPaymentFactSubject {
  return {
    paymentId: text(payload, type, "paymentId"),
    account: text(payload, type, "account"),
    providerRef: text(payload, type, "providerRef"),
    subjectType: text(payload, type, "subjectType"),
    subjectId: text(payload, type, "subjectId"),
    role: oneOf(payload, type, "role", ROLES),
    amountCents: cents(payload, type, "amountCents"),
  };
}

/**
 * **Un paiement par carte est encaissé** — fait DURABLE, écrit dans la
 * transaction qui passe la ligne `paid`, APRÈS l'appel au canal (plan M2,
 * §3.6). Il porte l'issue du canal (`applied`, `refused`, `already_applied`) :
 * un abonné sait si le sujet a franchi, ou s'il a refusé l'argent.
 *
 * Clé `card_payment.settled:<paymentId>` : un paiement n'est encaissé qu'une
 * fois (`paid` est sans retour).
 */
export class CardPaymentSettledFact implements DurableEvent {
  constructor(
    readonly payment: CardPaymentFactSubject,
    readonly outcome: SubjectPaidOutcome,
    readonly paidAt: Date,
  ) {}

  durableFact(): DurableFact {
    return {
      type: CARD_PAYMENT_SETTLED,
      key: `${CARD_PAYMENT_SETTLED}:${this.payment.paymentId}`,
      payload: {
        ...paymentPayload(this.payment),
        outcome: this.outcome,
        paidAt: this.paidAt.toISOString(),
      },
    };
  }

  /** @throws {CardPaymentFactPayloadError} charge hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): CardPaymentSettledFact {
    return new CardPaymentSettledFact(
      paymentOf(payload, CARD_PAYMENT_SETTLED),
      oneOf(payload, CARD_PAYMENT_SETTLED, "outcome", OUTCOMES),
      instant(payload, CARD_PAYMENT_SETTLED, "paidAt"),
    );
  }
}

/**
 * **Un paiement par carte est refusé par la banque** — fait DURABLE, même
 * transaction, même ordre que l'encaissement. Clé
 * `card_payment.failed:<paymentId>` : `pending → failed` n'a lieu qu'une fois
 * (un second refus est un rejeu, `failed → failed`, qui ne s'écrit pas).
 */
export class CardPaymentFailedFact implements DurableEvent {
  constructor(readonly payment: CardPaymentFactSubject) {}

  durableFact(): DurableFact {
    return {
      type: CARD_PAYMENT_FAILED,
      key: `${CARD_PAYMENT_FAILED}:${this.payment.paymentId}`,
      payload: paymentPayload(this.payment),
    };
  }

  /** @throws {CardPaymentFactPayloadError} charge hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): CardPaymentFailedFact {
    return new CardPaymentFailedFact(paymentOf(payload, CARD_PAYMENT_FAILED));
  }
}

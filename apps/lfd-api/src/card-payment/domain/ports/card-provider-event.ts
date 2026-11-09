import type { CardRefundStatus } from "./card-provider-types.js";

/** Ce que tout événement réduit garde de l'original : son identité et son type. */
interface ProviderEventOrigin {
  /** `evt_…` chez Stripe — unique par événement : la clé des faits qu'il fait naître. */
  readonly eventId: string;
  /** `payment_intent.succeeded`, `refund.updated`… tel que le prestataire l'écrit. */
  readonly eventType: string;
}

/** Une intention encaissée (`payment_intent.succeeded`). */
export interface IntentPaidEvent extends ProviderEventOrigin {
  readonly kind: "paid";
  readonly providerRef: string;
}

/** Une intention refusée par la banque (`payment_intent.payment_failed`). */
export interface IntentFailedEvent extends ProviderEventOrigin {
  readonly kind: "payment_failed";
  readonly providerRef: string;
}

/**
 * Un remboursement annoncé (`refund.created`, `refund.updated`,
 * `refund.failed`) — tel que `RecordOrderRefundCommand` le lit aujourd'hui
 * (vérifié le 2026-11-09 dans `payments-webhook.controller.ts`).
 */
export interface RefundEvent extends ProviderEventOrigin {
  readonly kind: "refund";
  /** L'intention remboursée. */
  readonly providerRef: string;
  readonly refundId: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly status: CardRefundStatus;
  /** L'instant du prestataire. */
  readonly createdAt: Date;
}

/**
 * La page hébergée d'un **lien de paiement** (`checkout.session.*`), relayée
 * à `b2b/payments` jusqu'à ce que son propre endpoint la reçoive (§4.5) :
 * `paid` (encaissée), `expired` (morte sans règlement).
 */
export interface CheckoutEvent extends ProviderEventOrigin {
  readonly kind: "checkout";
  readonly outcome: "paid" | "expired";
  readonly sessionId: string;
}

/** Tout le reste : hors de nos sujets — pas une anomalie en soi (§3.3). */
export interface OtherProviderEvent extends ProviderEventOrigin {
  readonly kind: "other";
}

/**
 * Un événement de webhook **déjà vérifié** et réduit à ce que le bloc décide :
 * jamais l'objet brut du prestataire.
 */
export type CardProviderEvent =
  IntentPaidEvent | IntentFailedEvent | RefundEvent | CheckoutEvent | OtherProviderEvent;

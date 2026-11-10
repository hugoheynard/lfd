import type Stripe from "stripe";

import type {
  CardProviderEvent,
  CheckoutEvent,
  OtherProviderEvent,
  RefundEvent,
  RefundMetadata,
} from "../../domain/ports/card-provider-event.js";
import { CARD_REFUND_STATUSES } from "../../domain/ports/card-provider-types.js";
import { REFUND_METADATA } from "./stripe-refund-calls.js";

// Réduction copiée de `b2b/payments/infrastructure/stripe-payment-gateway.ts`
// le 2026-11-09 (plan M2, §4.2), à deux différences près : chaque événement
// garde son identité et son type (la clé des faits qu'il fait naître), et ce
// que l'original rendait `ignored` est rendu `other` — le bloc en fait un
// fait `unmatched`, jamais un 200 muet (§3.3).

/** Stripe date ses objets en secondes Unix. */
const MS_PER_SECOND = 1000;

/**
 * La métadonnée qui marque une page hébergée ouverte par un LIEN de paiement
 * (`b2b/payments/infrastructure/stripe-checkout-gateway.ts`, vérifié le
 * 2026-11-09) — 🔴 valeur posée chez Stripe, qui ne se renomme pas.
 */
export const PAYMENT_LINK_METADATA_KEY = "paymentLinkId";

/** Réduit un événement Stripe vérifié à la forme du bloc. */
export function reduceEvent(event: Stripe.Event): CardProviderEvent {
  const origin = { eventId: event.id, eventType: event.type };
  if (event.type === "payment_intent.succeeded") {
    return { ...origin, kind: "paid", providerRef: event.data.object.id };
  }
  if (event.type === "payment_intent.payment_failed") {
    return { ...origin, kind: "payment_failed", providerRef: event.data.object.id };
  }
  if (
    event.type === "refund.created" ||
    event.type === "refund.updated" ||
    event.type === "refund.failed"
  ) {
    return reduceRefund(origin, event.data.object);
  }
  // `charge.refunded` tombe dans `other`, et c'est voulu : son objet ne porte
  // plus la liste des remboursements depuis l'API 2022-11-15.
  return reduceCheckoutEvent(origin, event);
}

type Origin = Pick<OtherProviderEvent, "eventId" | "eventType">;

/**
 * Un remboursement réduit, ou `other` : sans intention de paiement (une
 * charge ancienne), ou sous un statut que le port ne connaît pas — le faire
 * passer pour un autre serait pire.
 */
function reduceRefund(origin: Origin, refund: Stripe.Refund): RefundEvent | OtherProviderEvent {
  const intent = refund.payment_intent;
  const providerRef = typeof intent === "string" ? intent : (intent?.id ?? null);
  const status = CARD_REFUND_STATUSES.find((known) => known === refund.status);
  if (providerRef === null || status === undefined) {
    return { ...origin, kind: "other" };
  }
  const ours = metadataOf(refund);
  return {
    ...origin,
    kind: "refund",
    providerRef,
    refundId: refund.id,
    amountCents: refund.amount,
    currency: refund.currency,
    status,
    createdAt: new Date(refund.created * MS_PER_SECOND),
    ...(ours === null ? {} : { ours }),
  };
}

/** Une génération est un entier positif écrit en décimal (`String(generation)`). */
const GENERATION = /^[1-9]\d*$/u;

/**
 * La demande qui a émis ce remboursement, lue sur SES métadonnées (plan M2,
 * §3.4, §5.2) — `null` sans elles (un remboursement du tableau de bord), ou
 * si elles sont illisibles : le constat le traite alors comme fait hors de la
 * plateforme, jamais comme la demande d'un autre.
 */
function metadataOf(refund: Stripe.Refund): RefundMetadata | null {
  const metadata = refund.metadata ?? {};
  const requestId = metadata[REFUND_METADATA.request];
  const generation = metadata[REFUND_METADATA.generation];
  if (requestId === undefined || requestId === "" || generation === undefined) {
    return null;
  }
  return GENERATION.test(generation) ? { requestId, generation: Number(generation) } : null;
}

/**
 * Les trois événements d'une page hébergée, **limités aux liens** : une
 * session sans `paymentLinkId` n'a pas été ouverte par nous. `completed` ne
 * vaut paiement que si `payment_status = paid` — un moyen différé termine la
 * page avant d'encaisser, et `async_payment_succeeded` dira le reste.
 */
function reduceCheckoutEvent(
  origin: Origin,
  event: Stripe.Event,
): CheckoutEvent | OtherProviderEvent {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    return isPaymentLink(session) && session.payment_status === "paid"
      ? { ...origin, kind: "checkout", outcome: "paid", sessionId: session.id }
      : { ...origin, kind: "other" };
  }
  if (event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    return isPaymentLink(session)
      ? { ...origin, kind: "checkout", outcome: "paid", sessionId: session.id }
      : { ...origin, kind: "other" };
  }
  if (event.type === "checkout.session.expired") {
    const session = event.data.object;
    return isPaymentLink(session)
      ? { ...origin, kind: "checkout", outcome: "expired", sessionId: session.id }
      : { ...origin, kind: "other" };
  }
  return { ...origin, kind: "other" };
}

function isPaymentLink(session: Stripe.Checkout.Session): boolean {
  const id = session.metadata?.[PAYMENT_LINK_METADATA_KEY];
  return id !== undefined && id !== "";
}

import Stripe from "stripe";

import type { IntentCancellation, PaymentIntentState } from "../domain/payment-gateway.js";

/**
 * Le code que Stripe rend quand une opération vise une intention dans un état
 * qui l'interdit — lu dans l'énuméré `PaymentIntent.LastPaymentError.Code` du
 * SDK `stripe` 22.4.0 (vérifié le 2026-09-26).
 */
const UNEXPECTED_STATE = "payment_intent_unexpected_state";

/**
 * Réduit un statut Stripe à l'état que la plateforme lit.
 *
 * `requires_capture` ne se présente pas chez nous (capture automatique, cf.
 * `createIntent`) ; s'il apparaissait, l'argent n'est pas encore pris : il reste
 * rangé avec ce qui attend un paiement.
 */
export function intentStateOf(status: Stripe.PaymentIntent.Status): PaymentIntentState {
  if (status === "succeeded" || status === "canceled" || status === "processing") {
    return status;
  }
  return "awaiting_payment";
}

/**
 * Ce que veut dire un refus d'annulation pour « statut interdit », selon le
 * statut que Stripe joint à son erreur (`error.payment_intent.status`).
 *
 * La déclaration de `paymentIntents.cancel` n'autorise l'annulation que depuis
 * `requires_*` et, « in rare cases », `processing` : les trois refus attendus
 * sont donc `canceled`, `succeeded` et `processing`. Un autre statut n'a pas de
 * sens connu, et se rend comme une réponse illisible.
 */
export function cancellationFromRefusedState(
  status: Stripe.PaymentIntent.Status | undefined,
): IntentCancellation {
  if (status === "canceled") {
    return { kind: "already_cancelled" };
  }
  if (status === "succeeded") {
    return { kind: "already_paid" };
  }
  if (status === "processing") {
    return { kind: "in_progress" };
  }
  return {
    kind: "unavailable",
    reason: `annulation refusée par Stripe dans un état inattendu (${status ?? "inconnu"})`,
  };
}

/**
 * Traduit ce que `paymentIntents.cancel` a levé.
 *
 * Seul un `StripeInvalidRequestError` (400/404) portant le code
 * {@link UNEXPECTED_STATE} dit quelque chose de l'intention. Tout le reste —
 * `StripeConnectionError` (réseau, délai), `StripeAPIError` (5xx),
 * `StripeRateLimitError`, un refus d'authentification, une intention inconnue —
 * signifie que le prestataire n'a pas répondu sur l'intention : `unavailable`.
 */
export function cancellationFromError(error: unknown): IntentCancellation {
  if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === UNEXPECTED_STATE) {
    return cancellationFromRefusedState(error.payment_intent?.status);
  }
  if (error instanceof Stripe.errors.StripeError) {
    return { kind: "unavailable", reason: `${error.type}: ${error.message}` };
  }
  return {
    kind: "unavailable",
    reason: error instanceof Error ? error.message : "erreur inconnue",
  };
}

/**
 * Le refus dit « état interdit » mais ne joint pas l'intention : il faut la
 * relire pour savoir lequel.
 *
 * Le SDK déclare `error.payment_intent` comme **facultatif** : rien ne garantit
 * que Stripe le joigne à ce refus-là (lu dans `stripe` 22.4.0, le 2026-09-26).
 * Sans relecture, un second clic sur « abandonner » — l'intention est déjà
 * annulée — se lirait comme une panne de Stripe.
 */
export function refusedWithoutState(error: unknown): boolean {
  return (
    error instanceof Stripe.errors.StripeInvalidRequestError &&
    error.code === UNEXPECTED_STATE &&
    error.payment_intent?.status === undefined
  );
}

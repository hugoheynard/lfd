import type Stripe from "stripe";

import type { PaymentLinkWebhookEvent } from "../domain/ports/checkout-gateway.js";

/**
 * La métadonnée qui marque une session ouverte pour un lien libre — 🔴 une
 * valeur posée chez Stripe, qui ne se renomme pas. Le webhook ne rapproche
 * QUE les sessions qui la portent.
 */
export const PAYMENT_LINK_METADATA_KEY = "paymentLinkId";

/**
 * **Les trois événements d'une page hébergée**, limités aux liens libres —
 * la réduction de l'ancien webhook commun (`stripe-payment-gateway.ts`,
 * retiré au lot P0.c2 du plan M2), à l'identique : une session sans
 * `paymentLinkId` n'a pas été ouverte par nous, et `completed` ne vaut
 * paiement que si `payment_status = paid` — un moyen différé termine la page
 * avant d'encaisser, et `async_payment_succeeded` dira le reste.
 */
export function reduceLinkEvent(event: Stripe.Event): PaymentLinkWebhookEvent {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    return isPaymentLink(session) && session.payment_status === "paid"
      ? { kind: "paid", sessionId: session.id }
      : { kind: "ignored" };
  }
  if (event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    return isPaymentLink(session) ? { kind: "paid", sessionId: session.id } : { kind: "ignored" };
  }
  if (event.type === "checkout.session.expired") {
    const session = event.data.object;
    return isPaymentLink(session)
      ? { kind: "expired", sessionId: session.id }
      : { kind: "ignored" };
  }
  return { kind: "ignored" };
}

function isPaymentLink(session: Stripe.Checkout.Session): boolean {
  const id = session.metadata?.[PAYMENT_LINK_METADATA_KEY];
  return id !== undefined && id !== "";
}

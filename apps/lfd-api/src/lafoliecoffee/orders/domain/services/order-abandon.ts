import type { OrderStatus, PaymentStatus } from "@lfd/contracts";

import { OrderAbandonNotAuthorError, type AbandonRefusal } from "../errors/order-abandon-errors.js";

/**
 * Où en est une commande face à l'abandon de son règlement :
 *
 * - `abandon` — son règlement n'est pas encaissé, elle attend : on l'abandonne ;
 * - `already_abandoned` — elle est déjà annulée. C'est le **second clic** :
 *   l'état voulu est atteint, l'appelant répond comme au premier ;
 * - un refus nommé sinon.
 */
export type AbandonStanding = "abandon" | "already_abandoned" | AbandonRefusal;

/**
 * Décide de l'abandon **sur l'état lu**, avant d'appeler Stripe.
 *
 * ⚠️ Ce n'est pas elle qui protège l'écriture — la condition est dans le
 * `where` de `OrderRepository.markAbandoned`, seule à voir un webhook arrivé
 * entre la lecture et l'écriture. Elle sert à ne pas annuler chez Stripe
 * l'intention d'une commande qu'on refuserait de toute façon, et à nommer le
 * refus.
 */
export function abandonStanding(status: OrderStatus, payment: PaymentStatus): AbandonStanding {
  if (status === "cancelled") {
    return "already_abandoned";
  }
  if (payment === "paid" || payment === "refunded") {
    return "already_paid";
  }
  if (payment === "not_required") {
    return "nothing_to_settle";
  }
  return status === "placed" ? "abandon" : "already_in_production";
}

/**
 * **Seul l'auteur abandonne** (Q2) : abandonner détruit, et ce geste revient à
 * qui a passé la commande — pas à tout membre de la société, qui peut pourtant
 * la lire. À appeler APRÈS le mur de visibilité, qui répond 404 aux autres.
 *
 * @throws {OrderAbandonNotAuthorError} le demandeur n'a pas passé la commande.
 */
export function ensureOrderAuthor(
  order: { readonly placedByUserId: string },
  actorUserId: string,
  orderId: string,
): void {
  if (order.placedByUserId !== actorUserId) {
    throw new OrderAbandonNotAuthorError(orderId);
  }
}

import { RecurringBasketFact } from "../../../../recurring/channels/commerce/index.js";
import type { SubAccountGesture } from "../../../../mail/channels/templates/b2b-mails.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import type { GestureNotice } from "../services/gesture-notice.dispatcher.js";

/**
 * L'avis d'un geste sur un panier récurrent tel que le fait du bloc
 * `recurring` le porte — site et principal FIGÉS au geste, l'auteur est
 * l'acheteur. Partagé par les abonnés des paniers, un par type de fait.
 *
 * `null` pour un panier sans société : il n'a pas de site, rien à annoncer.
 *
 * @throws {RecurringBasketFactPayloadError} charge hors forme.
 */
export function basketGestureNotice(
  delivery: DurableDelivery,
  gesture: SubAccountGesture,
): GestureNotice | null {
  const fact = RecurringBasketFact.fromDelivery(delivery);
  if (fact.site === null) {
    return null;
  }
  return {
    eventId: delivery.eventId,
    kind: "subscription_changed",
    gesture,
    principalCompanyId: fact.site.principalCompanyId,
    siteName: fact.site.name,
    reference: null,
    authorUserId: fact.buyerUserId,
    byTeam: false,
  };
}

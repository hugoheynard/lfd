import { Injectable } from "@nestjs/common";

import { RECURRING_BASKET_RESUMED } from "../../../../recurring/channels/commerce/index.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { GestureNoticeDispatcher } from "../services/gesture-notice.dispatcher.js";
import { basketGestureNotice } from "./basket-gesture-notice.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const NOTIFY_PRINCIPAL_ON_SUBSCRIPTION_RESUMED =
  "b2b.sub-account-notices.on-subscription-resumed";

/**
 * **Un site a repris un panier récurrent → son principal est prévenu**
 * (`plan-notifications-sous-comptes.md`, N4e, clé `subscription_changed`).
 * Abonné au fait `recurring.basket_resumed` du bloc des paniers, par son canal. Le mail
 * ne dit rien du panier : ni lignes, ni adresse, ni cadence, ni montant.
 */
@Injectable()
@DurableHandler({
  type: RECURRING_BASKET_RESUMED,
  subscriber: NOTIFY_PRINCIPAL_ON_SUBSCRIPTION_RESUMED,
})
export class NotifyPrincipalOnSubscriptionResumed implements DurableSubscriber {
  constructor(private readonly notices: GestureNoticeDispatcher) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const notice = basketGestureNotice(delivery, "subscription_resumed");
    if (notice !== null) {
      await this.notices.notify(notice);
    }
  }
}

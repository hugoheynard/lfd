import { Injectable } from "@nestjs/common";

import {
  SiteGestureFact,
  SUBSCRIPTION_STATUS_CHANGED,
} from "../../../account/domain/events/site-gesture.fact.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { GestureNoticeDispatcher } from "../services/gesture-notice.dispatcher.js";
import { siteGestureNotice } from "./site-gesture-notice.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const NOTIFY_PRINCIPAL_ON_SUBSCRIPTION_STATUS_CHANGED =
  "b2b.sub-account-notices.on-subscription-status-changed";

/**
 * **Un site a mis en pause ou repris un panier récurrent → son principal est prévenu**
 * (`plan-notifications-sous-comptes.md`, N4e, clé `subscription_changed`).
 * Le mail ne dit rien du panier : ni lignes, ni adresse, ni cadence, ni montant.
 */
@Injectable()
@DurableHandler({
  type: SUBSCRIPTION_STATUS_CHANGED,
  subscriber: NOTIFY_PRINCIPAL_ON_SUBSCRIPTION_STATUS_CHANGED,
})
export class NotifyPrincipalOnSubscriptionStatusChanged implements DurableSubscriber {
  constructor(private readonly notices: GestureNoticeDispatcher) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const gesture =
      SiteGestureFact.statusOf(delivery.payload) === "paused"
        ? "subscription_paused"
        : "subscription_resumed";
    await this.notices.notify(siteGestureNotice(delivery, "subscription_changed", gesture));
  }
}

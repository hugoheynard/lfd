import { Injectable } from "@nestjs/common";

import { SUBSCRIPTION_DELETED } from "../../../account/domain/events/site-gesture.fact.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { GestureNoticeDispatcher } from "../services/gesture-notice.dispatcher.js";
import { siteGestureNotice } from "./site-gesture-notice.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const NOTIFY_PRINCIPAL_ON_SUBSCRIPTION_DELETED =
  "b2b.sub-account-notices.on-subscription-deleted";

/**
 * **Un site a arrêté un panier récurrent → son principal est prévenu**
 * (`plan-notifications-sous-comptes.md`, N4e, clé `subscription_changed`).
 * Le mail ne dit rien du panier : ni lignes, ni adresse, ni cadence, ni montant.
 */
@Injectable()
@DurableHandler({
  type: SUBSCRIPTION_DELETED,
  subscriber: NOTIFY_PRINCIPAL_ON_SUBSCRIPTION_DELETED,
})
export class NotifyPrincipalOnSubscriptionDeleted implements DurableSubscriber {
  constructor(private readonly notices: GestureNoticeDispatcher) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    await this.notices.notify(
      siteGestureNotice(delivery, "subscription_changed", "subscription_stopped"),
    );
  }
}

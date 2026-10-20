import { Injectable } from "@nestjs/common";

import { DEFAULT_DELIVERY_SET } from "../../../account/domain/events/site-gesture.fact.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { GestureNoticeDispatcher } from "../services/gesture-notice.dispatcher.js";
import { siteGestureNotice } from "./site-gesture-notice.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const NOTIFY_PRINCIPAL_ON_DEFAULT_DELIVERY_SET =
  "b2b.sub-account-notices.on-default-delivery-set";

/**
 * **Un site a changé son adresse de livraison par défaut → son principal est prévenu**
 * (`plan-notifications-sous-comptes.md`, N4b, clé `delivery_address_changed`).
 * Le mail ne dit rien de l'adresse ; il dit « fait par notre équipe » quand
 * l'équipe a agi.
 */
@Injectable()
@DurableHandler({
  type: DEFAULT_DELIVERY_SET,
  subscriber: NOTIFY_PRINCIPAL_ON_DEFAULT_DELIVERY_SET,
})
export class NotifyPrincipalOnDefaultDeliverySet implements DurableSubscriber {
  constructor(private readonly notices: GestureNoticeDispatcher) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    await this.notices.notify(
      siteGestureNotice(delivery, "delivery_address_changed", "default_delivery_set"),
    );
  }
}

import { Injectable } from "@nestjs/common";

import { DELIVERY_ADDRESS_ADDED } from "../../../account/domain/events/site-gesture.fact.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { GestureNoticeDispatcher } from "../services/gesture-notice.dispatcher.js";
import { siteGestureNotice } from "./site-gesture-notice.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const NOTIFY_PRINCIPAL_ON_DELIVERY_ADDRESS_ADDED =
  "b2b.sub-account-notices.on-delivery-address-added";

/**
 * **Un site a ajouté une adresse de livraison → son principal est prévenu**
 * (`plan-notifications-sous-comptes.md`, N4b, clé `delivery_address_changed`).
 * Le mail ne dit rien de l'adresse ; il dit « fait par notre équipe » quand
 * l'équipe a agi.
 */
@Injectable()
@DurableHandler({
  type: DELIVERY_ADDRESS_ADDED,
  subscriber: NOTIFY_PRINCIPAL_ON_DELIVERY_ADDRESS_ADDED,
})
export class NotifyPrincipalOnDeliveryAddressAdded implements DurableSubscriber {
  constructor(private readonly notices: GestureNoticeDispatcher) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    await this.notices.notify(
      siteGestureNotice(delivery, "delivery_address_changed", "delivery_address_added"),
    );
  }
}

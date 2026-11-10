import { Injectable } from "@nestjs/common";

import { PRIMARY_CONTACT_CHANGED } from "../../../account/domain/events/site-gesture.fact.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { GestureNoticeDispatcher } from "../services/gesture-notice.dispatcher.js";
import { siteGestureNotice } from "./site-gesture-notice.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const NOTIFY_PRINCIPAL_ON_PRIMARY_CONTACT_CHANGED =
  "b2b.sub-account-notices.on-primary-contact-changed";

/**
 * **Un site a changé son contact principal → son principal est prévenu**
 * (`plan-notifications-sous-comptes.md`, N4c, clé `contact_changed`).
 * Le mail ne nomme personne ; il dit « fait par notre équipe » quand
 * l'équipe a agi.
 */
@Injectable()
@DurableHandler({
  type: PRIMARY_CONTACT_CHANGED,
  subscriber: NOTIFY_PRINCIPAL_ON_PRIMARY_CONTACT_CHANGED,
})
export class NotifyPrincipalOnPrimaryContactChanged implements DurableSubscriber {
  constructor(private readonly notices: GestureNoticeDispatcher) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    await this.notices.notify(
      siteGestureNotice(delivery, "contact_changed", "primary_contact_changed"),
    );
  }
}

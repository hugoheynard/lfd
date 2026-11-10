import { Injectable } from "@nestjs/common";

import { CONTACT_ADDED } from "../../../account/domain/events/site-gesture.fact.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { GestureNoticeDispatcher } from "../services/gesture-notice.dispatcher.js";
import { siteGestureNotice } from "./site-gesture-notice.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const NOTIFY_PRINCIPAL_ON_CONTACT_ADDED = "b2b.sub-account-notices.on-contact-added";

/**
 * **Un site a ajouté un contact → son principal est prévenu**
 * (`plan-notifications-sous-comptes.md`, N4c, clé `contact_changed`).
 * Le mail ne nomme personne ; il dit « fait par notre équipe » quand
 * l'équipe a agi.
 */
@Injectable()
@DurableHandler({ type: CONTACT_ADDED, subscriber: NOTIFY_PRINCIPAL_ON_CONTACT_ADDED })
export class NotifyPrincipalOnContactAdded implements DurableSubscriber {
  constructor(private readonly notices: GestureNoticeDispatcher) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    await this.notices.notify(siteGestureNotice(delivery, "contact_changed", "contact_added"));
  }
}

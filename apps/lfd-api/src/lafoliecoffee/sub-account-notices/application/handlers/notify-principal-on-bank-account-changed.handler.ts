import { Injectable } from "@nestjs/common";

import { BANK_ACCOUNT_CHANGED } from "../../../account/domain/events/site-gesture.fact.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { GestureNoticeDispatcher } from "../services/gesture-notice.dispatcher.js";
import { siteGestureNotice } from "./site-gesture-notice.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const NOTIFY_PRINCIPAL_ON_BANK_ACCOUNT_CHANGED =
  "b2b.sub-account-notices.on-bank-account-changed";

/**
 * **Un site a enregistré un nouveau RIB → son principal est prévenu**
 * (`plan-notifications-sous-comptes.md`, N4d, clé `bank_account_changed`).
 * Le mail ne dit rien du compte (ni IBAN, ni titulaire, ni BIC) ; il dit
 * « fait par notre équipe » quand l'équipe a agi.
 */
@Injectable()
@DurableHandler({
  type: BANK_ACCOUNT_CHANGED,
  subscriber: NOTIFY_PRINCIPAL_ON_BANK_ACCOUNT_CHANGED,
})
export class NotifyPrincipalOnBankAccountChanged implements DurableSubscriber {
  constructor(private readonly notices: GestureNoticeDispatcher) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    await this.notices.notify(
      siteGestureNotice(delivery, "bank_account_changed", "bank_account_changed"),
    );
  }
}

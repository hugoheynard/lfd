import { Injectable } from "@nestjs/common";

import {
  ORDER_PROBLEM_REPORTED,
  OrderProblemReportedFact,
} from "../../../contact/domain/order-problem-reported.fact.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { GestureNoticeDispatcher } from "../services/gesture-notice.dispatcher.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const NOTIFY_PRINCIPAL_ON_ORDER_PROBLEM_REPORTED =
  "b2b.sub-account-notices.on-order-problem-reported";

/**
 * **Un site a signalé un problème sur une commande → son principal est
 * prévenu** (`plan-notifications-sous-comptes.md`, N4a, clé
 * `order_problem_reported`).
 *
 * Le principal est celui que le fait porte — COPIÉ sur la commande à sa
 * passation, jamais relu dans la hiérarchie. Une commande d'avant la copie
 * n'en a pas : rien ne part (assumé, N4 « Par action »). Le mail dit le site
 * et le numéro de commande, jamais le motif ni le message.
 */
@Injectable()
@DurableHandler({
  type: ORDER_PROBLEM_REPORTED,
  subscriber: NOTIFY_PRINCIPAL_ON_ORDER_PROBLEM_REPORTED,
})
export class NotifyPrincipalOnOrderProblemReported implements DurableSubscriber {
  constructor(private readonly notices: GestureNoticeDispatcher) {}

  handle(delivery: DurableDelivery): Promise<void> {
    const fact = OrderProblemReportedFact.fromPayload(delivery.payload);
    return this.notices.notify({
      eventId: delivery.eventId,
      kind: "order_problem_reported",
      gesture: "problem_reported",
      principalCompanyId: fact.site.principalCompanyId,
      siteName: fact.site.name,
      reference: fact.orderNumber,
      authorUserId: fact.authorUserId,
      byTeam: false,
    });
  }
}

import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../../platform/outbox/durable-handler.js";
import { CARD_PAYMENT_SETTLED, CardPaymentSettledFact } from "../../../../channels/facts/index.js";
import { CardRefunds } from "../../../../channels/requests/index.js";
import {
  PAY_LINK_TEST_SUBJECT_TYPE,
  payLinkTestSubject,
} from "../../domain/pay-link-test-subject.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const REFUND_PAID_PAY_LINK_TEST = "payment.refund-paid-pay-link-test";

/** Le code de la demande — 🔴 une valeur écrite (`payment.card_refund_request.reason`). */
export const PAY_LINK_TEST_REFUND_REASON = "pay_link_test";

/**
 * **L'euro d'un essai se rembourse tout seul** (doc
 * `documentation/payment/les-liens-de-paiement.md`, « Le lien d'essai ») —
 * sur le modèle de `RefundPaidAfterCancellation` : le sujet ne peut pas le
 * demander dans `onPaid`, appelé avant que la ligne du paiement soit `paid`.
 *
 * Dans l'unité de travail du reçu : `CardRefunds.requestRemainder` sur le
 * sujet, qui prend le verrou de l'essai (`lockSubject`) puis demande le
 * reste de CHAQUE paiement encaissé — tout paiement d'un essai est rendu.
 * Un fait relivré ne fait rien : le port rend la demande en cours, ou rien
 * quand tout est rendu. L'exécuteur part après validation.
 */
@Injectable()
@DurableHandler({ type: CARD_PAYMENT_SETTLED, subscriber: REFUND_PAID_PAY_LINK_TEST })
export class RefundPaidPayLinkTest implements DurableSubscriber {
  constructor(private readonly refunds: CardRefunds) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = CardPaymentSettledFact.fromPayload(delivery.payload);
    if (fact.payment.subjectType !== PAY_LINK_TEST_SUBJECT_TYPE) {
      return;
    }
    await this.refunds.requestRemainder(
      { subject: payLinkTestSubject(fact.payment.subjectId) },
      {
        nature: "return",
        reason: PAY_LINK_TEST_REFUND_REASON,
        schedule: "now",
        requestedBy: null,
      },
    );
  }
}

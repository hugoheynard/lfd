import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  ORDER_COMPLEMENT_PAID_LATE,
  OrderComplementPaidLateEvent,
} from "../../domain/events/order-complement-paid-late.event.js";
import { CardIncreaseRefund } from "../../revision/application/services/card-increase-refund.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const REFUND_LATE_COMPLEMENT = "orders.refund-late-complement";

/**
 * **Le complément payé après l'abandon se rend tout seul** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.4, §2.7.8) — la figure de `RefundPaidAfterCancellation` : le projet est `closed`,
 * la modification ne sera pas faite, l'argent n'est pas à nous.
 *
 * Après validation du webhook — pendant `onPaid`, le paiement n'est pas encore
 * encaissé pour le bloc des cartes, et la demande serait refusée. Dans
 * l'unité de travail du reçu : `orders`, le reste du paiement, puis la
 * demande d'ajustement (`late_payment`). Aucun e-mail : le client a abandonné
 * ou laissé passer le délai.
 */
@Injectable()
@DurableHandler({ type: ORDER_COMPLEMENT_PAID_LATE, subscriber: REFUND_LATE_COMPLEMENT })
export class RefundLateComplement implements DurableSubscriber {
  constructor(private readonly refund: CardIncreaseRefund) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderComplementPaidLateEvent.fromPayload(delivery.payload);
    await this.refund.returnRemainder(event, "late_payment");
  }
}

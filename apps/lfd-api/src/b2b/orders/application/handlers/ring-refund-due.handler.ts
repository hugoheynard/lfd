import { Injectable } from "@nestjs/common";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";

import { Clock } from "../../../../platform/time/clock.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import {
  ORDER_PAID_AFTER_CANCELLATION,
  OrderPaidAfterCancellationEvent,
} from "../../domain/events/order-paid-after-cancellation.event.js";
import { FailedSettlementReader } from "../../domain/ports/failed-settlement.reader.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const RING_REFUND_DUE = "orders.ring-refund-due";

/**
 * **« Encaissé sur une commande annulée — à rembourser »** (plan
 * `documentation/order/plan-abandon-du-reglement.md`, lot 6 bis).
 *
 * Toutes clientèles : c'est de l'argent à rendre, particulier ou pro. Sans
 * destinataire nommé, comme la cloche des règlements tombés : visible de tout
 * le back-office. Une clé par commande : Stripe qui réémet ne sonne pas deux
 * fois.
 *
 * Le remboursement lui-même n'existe pas dans ce système (chantier
 * d'annulation général) : la cloche dit quoi faire, pas comment l'automatiser.
 *
 * ## Durable depuis le 2026-10-10 (lot E4b)
 *
 * Elle écoutait le fait en mémoire, publié APRÈS l'écriture : un redémarrage
 * entre les deux perdait la cloche « à rembourser », sans témoin. Elle lit désormais le fait
 * durable écrit dans l'unité de travail de l'émetteur
 * (`documentation/journalisation/plan-evenements-durables.md`). Elle ne
 * rattrape plus ses échecs : le geste est déjà accusé, et c'est la boîte
 * d'envoi qui rejoue — la clé de la cloche dédoublonne.
 */
@Injectable()
@DurableHandler({ type: ORDER_PAID_AFTER_CANCELLATION, subscriber: RING_REFUND_DUE })
export class RingRefundDue implements DurableSubscriber {
  constructor(
    private readonly orders: FailedSettlementReader,
    private readonly notifier: StaffNotifier,
    private readonly clock: Clock,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderPaidAfterCancellationEvent.fromPayload(delivery.payload);
    const subject = await this.orders.subjectOf(event.orderId);
    if (subject === null) {
      return;
    }
    const who = subject.companyName ?? subject.orderNumber;
    await this.notifier.notify([
      {
        kind: "order.paid_after_cancellation",
        subject: `Encaissé sur une commande annulée — ${who}`,
        body:
          `Commande ${subject.orderNumber} : la carte a été débitée après l'annulation. ` +
          "La commande reste annulée et ne sera pas produite : à rembourser depuis Stripe.",
        link: `/commandes/${event.orderId}`,
        idempotencyKey: `notification:order.paid_after_cancellation:${event.orderId}`,
        occurredAt: this.clock.now(),
      },
    ]);
  }
}

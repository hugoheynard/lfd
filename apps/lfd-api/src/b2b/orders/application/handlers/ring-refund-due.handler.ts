import { Logger } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { OrderPaidAfterCancellationEvent } from "../../domain/events/order-paid-after-cancellation.event.js";
import { FailedSettlementReader } from "../../domain/ports/failed-settlement.reader.js";

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
 */
@EventsHandler(OrderPaidAfterCancellationEvent)
export class RingRefundDue implements IEventHandler<OrderPaidAfterCancellationEvent> {
  private readonly logger = new Logger(RingRefundDue.name);

  constructor(
    private readonly orders: FailedSettlementReader,
    private readonly notifier: StaffNotifier,
    private readonly clock: Clock,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: OrderPaidAfterCancellationEvent): void {
    void this.work.track(this.run(event), "ring-refund-due");
  }

  private async run(event: OrderPaidAfterCancellationEvent): Promise<void> {
    // Sonner ne fait jamais échouer le webhook : Stripe réémettrait sans fin.
    try {
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
    } catch (error) {
      this.logger.error(`Cloche « à rembourser » non émise (commande ${event.orderId})`, error);
    }
  }
}

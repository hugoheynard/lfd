import { Logger } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { RefundRejectedError } from "../../domain/errors/order-refund-errors.js";
import { OrderRefundRejectedEvent } from "../../domain/events/order-refund-rejected.event.js";

/**
 * **« Remboursement Stripe non noté »** (lot R1) : la commande a refusé un
 * remboursement — devise, cumul au-delà du total, montant ou statut
 * incohérents. L'argent est peut-être déjà rendu chez Stripe ; chez nous,
 * rien n'a été écrit. Quelqu'un doit comparer les deux.
 *
 * Sans destinataire nommé, comme `RingRefundDue` : visible de tout le
 * back-office. Une clé par remboursement et par motif : Stripe qui réémet
 * (`refund.created` puis `refund.updated`) ne sonne pas deux fois.
 */
@EventsHandler(OrderRefundRejectedEvent)
export class RingRefundRejected implements IEventHandler<OrderRefundRejectedEvent> {
  private readonly logger = new Logger(RingRefundRejected.name);

  constructor(
    private readonly notifier: StaffNotifier,
    private readonly clock: Clock,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: OrderRefundRejectedEvent): void {
    void this.work.track(this.run(event), "ring-refund-rejected");
  }

  private async run(event: OrderRefundRejectedEvent): Promise<void> {
    // Sonner ne fait jamais échouer le webhook : il a déjà répondu.
    try {
      await this.notifier.notify([
        {
          kind: "order.refund_rejected",
          subject: `Remboursement Stripe non noté — ${event.orderNumber}`,
          body:
            `Commande ${event.orderNumber}, remboursement de ${euros(event.amountCents)}. ` +
            new RefundRejectedError(event.reason).message,
          link: `/commandes/${event.orderId}`,
          idempotencyKey: `notification:order.refund_rejected:${event.stripeRefundId}:${event.reason}`,
          occurredAt: this.clock.now(),
        },
      ]);
    } catch (error) {
      this.logger.error(
        `Cloche « remboursement non noté » non émise (commande ${event.orderId})`,
        error,
      );
    }
  }
}

/** « 1 234,56 € » — pour un message, pas pour un calcul. */
function euros(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

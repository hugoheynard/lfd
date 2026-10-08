import { Logger } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { RefundNotCreditedEvent } from "../../domain/events/refund-not-credited.event.js";

const WHY: Readonly<Record<RefundNotCreditedEvent["reason"], string>> = {
  account_invoice:
    "La commande est sur une facture du mois : l'avoir dépend de ce que ce remboursement " +
    "réglait — l'émettre à la main si la vente est rendue.",
  exceeds_invoice:
    "Le montant dépasse ce que la facture porte encore (un avoir est déjà passé) : " +
    "comparer les avoirs et le remboursement Stripe.",
};

/**
 * **« Remboursement sans avoir »** (lot E5b) : de l'argent est rendu chez
 * Stripe, et aucun avoir automatique ne le constate. Sans destinataire nommé,
 * comme `RingRefundRejected` : visible de tout le back-office. Une clé par
 * remboursement : un rapprochement rejoué ne sonne pas deux fois.
 */
@EventsHandler(RefundNotCreditedEvent)
export class RingRefundNotCredited implements IEventHandler<RefundNotCreditedEvent> {
  private readonly logger = new Logger(RingRefundNotCredited.name);

  constructor(
    private readonly notifier: StaffNotifier,
    private readonly clock: Clock,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: RefundNotCreditedEvent): void {
    void this.work.track(this.run(event), "ring-refund-not-credited");
  }

  private async run(event: RefundNotCreditedEvent): Promise<void> {
    try {
      await this.notifier.notify([
        {
          kind: "order.refund_not_credited",
          subject: `Remboursement sans avoir — ${event.orderNumber}`,
          body:
            `Commande ${event.orderNumber}, remboursement de ${euros(event.amountCents)}, ` +
            `facture ${event.invoiceNumber}. ${WHY[event.reason]}`,
          link: `/commandes/${event.orderId}`,
          idempotencyKey: `notification:order.refund_not_credited:${event.refundId}`,
          occurredAt: this.clock.now(),
        },
      ]);
    } catch (error) {
      this.logger.error(`Cloche « remboursement sans avoir » non émise (${event.orderId})`, error);
    }
  }
}

/** « 1 234,56 € » — pour un message, pas pour un calcul. */
function euros(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

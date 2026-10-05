import { Inject } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { DEFAULT_MAIL_LOCALE } from "../../../../platform/mailer/copy/mail-copy.js";
import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import { OrderPaymentFailedEvent } from "../../domain/events/order-payment-failed.event.js";
import { OrderRecipientReader } from "../../domain/ports/order-recipient.reader.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { clientSheetOf } from "../../domain/services/order-sheet.js";

/**
 * **« Votre paiement n'a pas abouti à temps »** — la clôture de la journée a
 * coupé un règlement resté en l'air, et la commande est annulée (plan
 * `documentation/order/plan-abandon-du-reglement.md`, Q4, Q7).
 *
 * Distinct du courriel de refus : personne n'a refusé la carte, et il n'y a
 * plus rien à reprendre — d'où l'absence de bouton. La phrase qui compte est
 * « rien n'a été débité » : c'est la question qu'un client se pose en lisant
 * « annulée ».
 *
 * La cause `day_closed` est publiée par le seul balayage de la clôture,
 * `PendingSettlementSweep` (lot 6, vérifié le 2026-09-26).
 */
@EventsHandler(OrderPaymentFailedEvent)
export class SendPaymentExpiredMail implements IEventHandler<OrderPaymentFailedEvent> {
  constructor(
    private readonly orders: OrderReader,
    private readonly recipients: OrderRecipientReader,
    private readonly work: BackgroundWork,
    @Inject(MAILER) private readonly mailer: B2bMailer,
  ) {}

  handle(event: OrderPaymentFailedEvent): void {
    if (event.cause !== "day_closed") {
      return;
    }
    // Suivi, comme ses voisins : il tourne hors de la requête qui l'a publié.
    void this.work.track(this.run(event), "send-payment-expired-mail");
  }

  private async run(event: OrderPaymentFailedEvent): Promise<void> {
    const owned = await this.orders.findById(event.orderId);
    if (owned === null) {
      return;
    }
    const recipient = await this.recipients.findById(owned.placedByUserId);
    if (recipient === null) {
      return;
    }
    await this.mailer.send({
      to: recipient.email,
      template: "customer.payment-expired",
      data: { sheet: clientSheetOf(owned.view, owned.billedCustomer), locale: DEFAULT_MAIL_LOCALE },
      idempotencyKey: `order.payment-expired:${event.orderId}`,
    });
  }
}

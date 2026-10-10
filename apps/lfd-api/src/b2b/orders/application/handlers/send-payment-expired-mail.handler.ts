import { Inject, Injectable } from "@nestjs/common";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";

import { DEFAULT_MAIL_LOCALE } from "../../../../platform/mailer/copy/mail-copy.js";
import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import {
  ORDER_PAYMENT_FAILED,
  OrderPaymentFailedEvent,
} from "../../domain/events/order-payment-failed.event.js";
import { OrderRecipientReader } from "../../domain/ports/order-recipient.reader.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { clientSheetOf } from "../../domain/services/order-sheet.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const SEND_PAYMENT_EXPIRED_MAIL = "orders.send-payment-expired-mail";

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
 *
 * ## Durable depuis le 2026-10-10 (lot E4b)
 *
 * Il écoutait le fait en mémoire, publié APRÈS la bascule : un redémarrage
 * entre les deux perdait le courriel « n'a pas abouti à temps », sans témoin. Il lit désormais le fait
 * durable écrit dans l'unité de travail qui bascule la commande
 * (`documentation/journalisation/plan-evenements-durables.md`) ; un échec
 * lève, et la boîte d'envoi le rejoue.
 */
@Injectable()
@DurableHandler({ type: ORDER_PAYMENT_FAILED, subscriber: SEND_PAYMENT_EXPIRED_MAIL })
export class SendPaymentExpiredMail implements DurableSubscriber {
  constructor(
    private readonly orders: OrderReader,
    private readonly recipients: OrderRecipientReader,
    @Inject(MAILER) private readonly mailer: B2bMailer,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderPaymentFailedEvent.fromPayload(delivery.payload);
    if (event.cause !== "day_closed") {
      return;
    }
    await this.run(event);
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
      data: {
        sheet: clientSheetOf(owned.view, owned.billedCustomer, owned.buyerPhone),
        locale: DEFAULT_MAIL_LOCALE,
      },
      idempotencyKey: `order.payment-expired:${event.orderId}`,
    });
  }
}

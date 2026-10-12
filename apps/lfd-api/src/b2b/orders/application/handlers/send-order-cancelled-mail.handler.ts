import { Inject, Injectable } from "@nestjs/common";

import { DEFAULT_MAIL_LOCALE } from "../../../../platform/mailer/copy/mail-copy.js";
import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { ORDER_CANCELLED, OrderCancelledEvent } from "../../domain/events/order-cancelled.event.js";
import { OrderRecipientReader } from "../../domain/ports/order-recipient.reader.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { clientSheetOf } from "../../domain/services/order-sheet.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const SEND_ORDER_CANCELLED_MAIL = "orders.send-order-cancelled-mail";

/**
 * **« Votre commande a été annulée par notre équipe »** (plan
 * `documentation/order/plan-annulation-de-commande.md`, C3.5, D9).
 *
 * Ni QR — une commande annulée ne se retire pas —, ni motif — il est interne.
 * Le corps dit ce qu'il advient de l'argent : rien à facturer (total nul), ou
 * rien de prélevé (carte non payée), ou — payée par carte (lot C4) — le
 * montant qui sera rendu sur la carte, dès l'annulation : la demande est
 * persistée et rejouée, la promesse est donc vraie même si Stripe hoquette.
 * Aucun second courriel au remboursement réussi (Q2). Et le bon rendu ou
 * refondu, s'il y en avait un — rien sur un bon échu (lot C3b).
 *
 * Un seul envoi : le fait n'est publié qu'au franchissement, et la clé
 * `order.cancelled:<orderId>` absorbe un rejeu de la boîte d'envoi.
 */
@Injectable()
@DurableHandler({ type: ORDER_CANCELLED, subscriber: SEND_ORDER_CANCELLED_MAIL })
export class SendOrderCancelledMail implements DurableSubscriber {
  constructor(
    private readonly orders: OrderReader,
    private readonly recipients: OrderRecipientReader,
    @Inject(MAILER) private readonly mailer: B2bMailer,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderCancelledEvent.fromPayload(delivery.payload);
    const owned = await this.orders.findById(event.orderId);
    if (owned === null) {
      return;
    }
    const recipient = await this.recipients.findById(owned.placedByUserId);
    // Un client sans adresse lisible ne fait pas échouer un abonné de fond :
    // l'annulation est écrite, c'est le courriel qui manque.
    if (recipient === null) {
      return;
    }
    await this.mailer.send({
      to: recipient.email,
      template: "customer.order-cancelled",
      data: {
        sheet: clientSheetOf(owned.view, owned.billedCustomer, owned.buyerPhone),
        regime: event.regime,
        voucher:
          event.voucher === null
            ? null
            : { ...event.voucher, expiresAt: event.voucher.expiresAt.toISOString() },
        refund: event.refund,
        locale: DEFAULT_MAIL_LOCALE,
      },
      idempotencyKey: `${ORDER_CANCELLED}:${event.orderId}`,
    });
  }
}

import { Injectable } from "@nestjs/common";

import { CardSettlementReader } from "../../../../card-payment/channels/requests/index.js";
import { Mail } from "../../../../mail/channels/requests/mail.js";
import { DEFAULT_MAIL_LOCALE } from "../../../../mail/channels/templates/mail-locale.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  ORDER_REFUND_SUCCEEDED,
  OrderRefundSucceededFact,
} from "../../domain/events/order-refund-succeeded.fact.js";
import { OrderRecipientReader } from "../../domain/ports/order-recipient.reader.js";
import { ShortfallRefundedNoticeReader } from "../../domain/ports/shortfall-refunded-notice.reader.js";
import { shortfallRefundedCentsOf } from "../../domain/services/shortfall-refunded.js";
import { orderCardSubject } from "../services/order-card-subject.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const SEND_SHORTFALL_REFUNDED_MAIL =
  "orders.send-shortfall-refunded-mail.on-refund-succeeded";

/** Le gabarit — 🔴 sa clé préfixe celle de chaque courriel parti. */
const TEMPLATE = "customer.order-shortfall-refunded";

/**
 * **« {amount} vous ont été remboursés sur votre carte »** — le reste d'un
 * départ incomplet, écrit au client quand le prestataire le confirme (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 7).
 *
 * Écoute tous les remboursements réussis d'une commande, et n'écrit que pour
 * une part du reste rendue par le prestataire (`shortfallRefundedCentsOf`) :
 * « Réglé autrement » publie le même fait et n'envoie rien. Une part = un
 * courriel, sous la clé `customer.order-shortfall-refunded:<refundId>`, sans
 * adresse : un rejeu n'envoie rien de plus. `mail.send` : demandé dans
 * l'unité du reçu, parti après validation.
 *
 * Destinataire : le client qui a passé la commande ; sans adresse lisible,
 * rien ne part — l'argent est rendu, c'est le courriel qui manque.
 */
@Injectable()
@DurableHandler({ type: ORDER_REFUND_SUCCEEDED, subscriber: SEND_SHORTFALL_REFUNDED_MAIL })
export class SendShortfallRefundedMail implements DurableSubscriber {
  constructor(
    private readonly cards: CardSettlementReader,
    private readonly notices: ShortfallRefundedNoticeReader,
    private readonly recipients: OrderRecipientReader,
    private readonly mail: Mail,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = OrderRefundSucceededFact.fromPayload(delivery.payload);
    const amountCents = await this.shortfallPartOf(fact);
    if (amountCents === null) {
      return;
    }
    const notice = await this.notices.noticeOf(fact.orderId);
    const recipient =
      notice === null ? null : await this.recipients.findById(notice.placedByUserId);
    if (notice === null || recipient === null) {
      return;
    }
    await this.mail.send({
      to: recipient.email,
      template: TEMPLATE,
      data: {
        reference: notice.reference,
        amountCents,
        locale: notice.locale ?? DEFAULT_MAIL_LOCALE,
      },
      idempotencyKey: `${TEMPLATE}:${fact.refundId}`,
      subjects: [{ type: "order", id: fact.orderId }],
    });
  }

  /** Le montant de la part du reste rendue par le prestataire, ou `null`. */
  private async shortfallPartOf(fact: OrderRefundSucceededFact): Promise<number | null> {
    const subject = orderCardSubject(fact.orderId);
    const [[refunds], [requests]] = await Promise.all([
      this.cards.refundsOf([subject]),
      this.cards.refundRequestsOf([subject]),
    ]);
    return shortfallRefundedCentsOf(
      fact.refundId,
      refunds?.refunds ?? [],
      (requests?.requests ?? []).map((request) => ({
        requestId: request.id,
        reason: request.reason,
      })),
    );
  }
}

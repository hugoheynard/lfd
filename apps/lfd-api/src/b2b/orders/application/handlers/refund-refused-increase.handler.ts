import { Injectable } from "@nestjs/common";

import { Mail } from "../../../../mail/channels/requests/mail.js";
import { DEFAULT_MAIL_LOCALE } from "../../../../mail/channels/templates/mail-locale.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  ORDER_CARD_INCREASE_REFUSED,
  OrderCardIncreaseRefusedEvent,
} from "../../domain/events/order-card-increase-refused.event.js";
import { CardIncreaseProposalReader } from "../../domain/ports/card-increase-proposal.reader.js";
import { OrderRecipientReader } from "../../domain/ports/order-recipient.reader.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { clientSheetOf } from "../../domain/services/order-sheet.js";
import { CardIncreaseRefund } from "../services/card-increase-refund.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const REFUND_REFUSED_INCREASE = "orders.refund-refused-increase";

/**
 * **Une hausse payée qui ne s'applique plus : le complément rendu, le client
 * prévenu** (doc `documentation/commandes/modification/modifier-une-commande.md`,
 * §2.7.5 étape 4, §2.7.8).
 *
 * Dans l'unité de travail du reçu : `orders`, le reste du paiement du
 * complément, la demande d'ajustement (`revision_refused`) — puis l'e-mail
 * `customer.order-modification-failed`, demandé dans la même unité (la boîte
 * d'envoi le part après validation). Sa clé est déterministe
 * (`card-increase-refused:<projet>`), sans adresse : un rejeu n'envoie rien
 * de plus. Destinataire : le client qui a demandé la hausse (R15 : seul le
 * client en fait), sinon celui qui a passé la commande.
 */
@Injectable()
@DurableHandler({ type: ORDER_CARD_INCREASE_REFUSED, subscriber: REFUND_REFUSED_INCREASE })
export class RefundRefusedIncrease implements DurableSubscriber {
  constructor(
    private readonly refund: CardIncreaseRefund,
    private readonly proposals: CardIncreaseProposalReader,
    private readonly orders: OrderReader,
    private readonly recipients: OrderRecipientReader,
    private readonly mail: Mail,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderCardIncreaseRefusedEvent.fromPayload(delivery.payload);
    await this.refund.returnRemainder(event, "revision_refused");
    await this.tellCustomer(event);
  }

  private async tellCustomer(event: OrderCardIncreaseRefusedEvent): Promise<void> {
    const owned = await this.orders.findById(event.orderId);
    if (owned === null) {
      return;
    }
    const proposal = await this.proposals.find(event.proposalId);
    const author = proposal?.toPersistence().author;
    const userId = author?.kind === "customer" ? author.userId : owned.placedByUserId;
    const recipient = await this.recipients.findById(userId);
    if (recipient === null) {
      return;
    }
    await this.mail.send({
      to: recipient.email,
      template: "customer.order-modification-failed",
      data: {
        sheet: clientSheetOf(owned.view, owned.billedCustomer, owned.buyerPhone, owned.revision),
        complementCents: event.complementCents,
        locale: DEFAULT_MAIL_LOCALE,
      },
      idempotencyKey: `card-increase-refused:${event.proposalId}`,
      subjects: [{ type: "order", id: event.orderId }],
    });
  }
}

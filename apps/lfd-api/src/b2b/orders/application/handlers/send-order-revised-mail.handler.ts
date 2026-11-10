import { exposedHandoverToken } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { Mail } from "../../../../mail/channels/requests/mail.js";
import { DEFAULT_MAIL_LOCALE } from "../../../../mail/channels/templates/mail-locale.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { ORDER_REVISED, OrderRevisedEvent } from "../../domain/events/order-revised.event.js";
import { OrderMailOrigins } from "../../domain/ports/order-mail-origins.js";
import { OrderRecipientReader } from "../../domain/ports/order-recipient.reader.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { clientSheetOf } from "../../domain/services/order-sheet.js";
import { revisionMoneyNoteOf } from "../../domain/services/revision-money-note.js";
import { OrderManageLink } from "../services/order-manage-link.js";
import { OrderSheetAttachment } from "../services/order-sheet-attachment.service.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const SEND_ORDER_REVISED_MAIL = "orders.send-revised-mail.on-revised";

/**
 * **« Votre commande ORD-… est modifiée »** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.8) —
 * demandé par Hugo le 2026-11-10 après un essai en production : aucune
 * modification n'écrivait au client.
 *
 * Il écoute `order.revised`, que toute révision ÉCRITE publie dans sa
 * transaction : M1 du client ou de l'équipe, et la hausse carte appliquée par
 * son exécuteur — donc jamais avant que la hausse soit payée et appliquée.
 *
 * 🔴 **Une demande M4 appliquée ne passe pas ici** (`origin: change_request`) :
 * le bloc `contact` écrit déjà `customer.order-change-applied`, qui porte
 * l'écart de total. Deux e-mails pour un geste en feraient un de trop.
 *
 * Clé déterministe par révision, sans adresse : un rejeu n'envoie rien de
 * plus. Le bon joint est celui de la révision courante de la commande.
 */
@Injectable()
@DurableHandler({ type: ORDER_REVISED, subscriber: SEND_ORDER_REVISED_MAIL })
export class SendOrderRevisedMail implements DurableSubscriber {
  constructor(
    private readonly orders: OrderReader,
    private readonly recipients: OrderRecipientReader,
    private readonly origins: OrderMailOrigins,
    private readonly attachment: OrderSheetAttachment,
    private readonly manageLink: OrderManageLink,
    private readonly mail: Mail,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderRevisedEvent.fromPayload(delivery.payload);
    if (event.origin === "change_request") {
      return;
    }
    await this.send(event);
  }

  private async send(event: OrderRevisedEvent): Promise<void> {
    const owned = await this.orders.findById(event.orderId);
    // La commande vient d'être révisée, son auteur est connu : on sort en
    // silence plutôt que de lever sur un cas qui ne désigne rien à corriger.
    if (owned === null) {
      return;
    }
    const recipient = await this.recipients.findById(event.placedByUserId);
    if (recipient === null) {
      return;
    }
    const sheet = clientSheetOf(owned.view, owned.billedCustomer, owned.buyerPhone, owned.revision);
    await this.mail.send({
      to: recipient.email,
      template: "customer.order-revised",
      data: {
        // La feuille PROJETÉE, jamais la vue : ni SKU, ni tarif d'entrée.
        sheet,
        previousTotalCents: event.totalBeforeCents,
        totalCents: event.totalAfterCents,
        moneyNote: revisionMoneyNoteOf(
          owned.view.settlement,
          event.totalBeforeCents,
          event.totalAfterCents,
        ),
        orderUrl: await this.manageLink.urlFor(event.orderId, this.origins.clientBaseUrl()),
        document: await this.attachment.of(sheet, exposedHandoverToken(owned.view)),
        locale: DEFAULT_MAIL_LOCALE,
      },
      idempotencyKey: `order.revised:${event.orderId}:${String(event.revision)}`,
      subjects: [{ type: "order", id: event.orderId }],
    });
  }
}

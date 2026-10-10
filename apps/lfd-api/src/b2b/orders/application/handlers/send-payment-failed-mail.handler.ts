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
import { OrderMailOrigins } from "../../domain/ports/order-mail-origins.js";
import { OrderRecipientReader } from "../../domain/ports/order-recipient.reader.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { clientSheetOf } from "../../domain/services/order-sheet.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const SEND_PAYMENT_FAILED_MAIL = "orders.send-payment-failed-mail";

/**
 * **« Votre paiement n'est pas passé »** — le seul courriel du parcours qui
 * annonce une mauvaise nouvelle.
 *
 * ## Ce qu'il répare
 *
 * 🔴 Un refus de carte n'était dit à **personne**. Le dépôt écrivait `failed`
 * dans une colonne que rien ne relisait : le client attendait une commande qui
 * n'entrerait jamais en fabrication — il avait même reçu, à la passation, un
 * message lui annonçant le contraire — et le comptoir continuait de la compter.
 *
 * ## Pourquoi il ne porte PAS de QR
 *
 * Une commande impayée ne se retire pas. Joindre un code à présenter
 * contredirait la phrase qui le précède, et c'est exactement le genre de
 * message qui fait venir quelqu'un pour rien.
 *
 * ## Il ne parle que d'un REFUS
 *
 * Le fait porte une cause depuis le 2026-09-26 (plan
 * `documentation/order/plan-abandon-du-reglement.md`, Q4, §9 bis S9). « Votre
 * banque a refusé » est faux pour les deux autres : le client qui abandonne
 * vient de cliquer et ne reçoit rien, et la clôture a son propre courriel
 * (`SendPaymentExpiredMail`).
 *
 * ## Pourquoi il ne part qu'une fois
 *
 * Le fait n'est publié qu'au **franchissement** : le dépôt ne bascule que ce qui
 * était encore `pending`, donc un webhook rejoué — Stripe réémet jusqu'à un
 * 2xx — ne produit aucun second événement. La clé d'idempotence est en outre
 * déterministe par commande : un rejeu de la boîte d'envoi n'en envoie pas
 * un second.
 *
 * ## Durable depuis le 2026-10-10 (lot E4b)
 *
 * Il écoutait le fait en mémoire, publié APRÈS la bascule : un redémarrage
 * entre les deux perdait le courriel de refus, sans témoin. Il lit désormais le fait
 * durable écrit dans l'unité de travail qui bascule la commande
 * (`documentation/journalisation/plan-evenements-durables.md`) ; un échec
 * lève, et la boîte d'envoi le rejoue.
 */
@Injectable()
@DurableHandler({ type: ORDER_PAYMENT_FAILED, subscriber: SEND_PAYMENT_FAILED_MAIL })
export class SendPaymentFailedMail implements DurableSubscriber {
  constructor(
    private readonly orders: OrderReader,
    private readonly recipients: OrderRecipientReader,
    private readonly origins: OrderMailOrigins,
    @Inject(MAILER) private readonly mailer: B2bMailer,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderPaymentFailedEvent.fromPayload(delivery.payload);
    if (event.cause !== "refused") {
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
    // Un client sans adresse lisible ne fait pas échouer un abonné de fond : le
    // refus est écrit, c'est le courriel qui manque.
    if (recipient === null) {
      return;
    }

    const client = this.origins.clientBaseUrl();
    await this.mailer.send({
      to: recipient.email,
      template: "customer.payment-failed",
      data: {
        sheet: clientSheetOf(owned.view, owned.billedCustomer, owned.buyerPhone),
        // Le règlement se reprend sur l'écran de la commande. Vide quand
        // l'origine n'est pas configurée : le gabarit omet alors le bouton
        // plutôt que de poser un lien inerte dans une boîte mail.
        settleUrl: client === null ? "" : `${client}/nouvelle-commande/reglement/${event.orderId}`,
        locale: DEFAULT_MAIL_LOCALE,
      },
      idempotencyKey: `order.payment-failed:${event.orderId}`,
    });
  }
}

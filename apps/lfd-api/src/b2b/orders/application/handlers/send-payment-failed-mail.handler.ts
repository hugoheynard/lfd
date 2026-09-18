import { Inject } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { DEFAULT_MAIL_LOCALE } from "../../../../platform/mailer/copy/mail-copy.js";
import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import { OrderPaymentFailedEvent } from "../../domain/events/order-payment-failed.event.js";
import { OrderMailOrigins } from "../../domain/ports/order-mail-origins.js";
import { OrderRecipientReader } from "../../domain/ports/order-recipient.reader.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { clientSheetOf } from "../../domain/services/order-sheet.js";

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
 * ## Pourquoi il ne part qu'une fois
 *
 * Le fait n'est publié qu'au **franchissement** : le dépôt ne bascule que ce qui
 * était encore `pending`, donc un webhook rejoué — Stripe réémet jusqu'à un
 * 2xx — ne produit aucun second événement. La clé d'idempotence est en outre
 * déterministe par commande.
 */
@EventsHandler(OrderPaymentFailedEvent)
export class SendPaymentFailedMail implements IEventHandler<OrderPaymentFailedEvent> {
  constructor(
    private readonly orders: OrderReader,
    private readonly recipients: OrderRecipientReader,
    private readonly origins: OrderMailOrigins,
    private readonly work: BackgroundWork,
    @Inject(MAILER) private readonly mailer: B2bMailer,
  ) {}

  handle(event: OrderPaymentFailedEvent): void {
    // **Suivi** : cet abonné tourne hors de la requête du webhook. Sans cette
    // inscription, un test vide la base pendant que l'envoi la lit, et l'échec
    // accuse le test SUIVANT.
    void this.work.track(this.run(event), "send-payment-failed-mail");
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
        sheet: clientSheetOf(owned.view),
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

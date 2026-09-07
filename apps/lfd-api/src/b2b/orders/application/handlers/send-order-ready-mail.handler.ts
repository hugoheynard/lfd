import { Inject } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { DEFAULT_MAIL_LOCALE } from "../../../../platform/mailer/copy/mail-copy.js";
import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import { OrderReadyEvent } from "../../domain/events/order-ready.event.js";
import { OrderMailOrigins } from "../../domain/ports/order-mail-origins.js";
import { OrderRecipientReader } from "../../domain/ports/order-recipient.reader.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { clientSheetOf } from "../../domain/services/order-sheet.js";

/**
 * **« Votre commande est prête »** — le seul courriel qui parte à un moment où
 * le client a quelque chose à FAIRE.
 *
 * ## Ce qu'il répare
 *
 * Un seul message partait jusqu'ici, et c'était le premier : « c'est
 * enregistré ». Puis plus rien — pas même quand la commande était prête, ce qui
 * est pourtant le seul instant où le client doit se déplacer ou être là. Il
 * fallait ouvrir l'app pour le savoir, ou passer au hasard.
 *
 * ## Pourquoi le QR revient
 *
 * Il était déjà dans la confirmation. Le répéter n'est pas une redite : c'est
 * **maintenant** qu'on s'en sert, et personne ne remonte un fil de courriels le
 * téléphone à la main devant un comptoir. Le message le plus récent doit se
 * suffire à lui-même.
 *
 * ## Pourquoi il ne part qu'une fois
 *
 * Deux garanties se superposent, et c'est voulu : l'écriture du colisage est
 * **conditionnée en base**, donc un seul poste gagne la course et un seul
 * publie le fait ; et la clé d'idempotence est déterministe par commande, donc
 * même un fait rejoué ne ferait pas partir un second message.
 */
@EventsHandler(OrderReadyEvent)
export class SendOrderReadyMail implements IEventHandler<OrderReadyEvent> {
  constructor(
    private readonly orders: OrderReader,
    private readonly recipients: OrderRecipientReader,
    private readonly origins: OrderMailOrigins,
    private readonly work: BackgroundWork,
    @Inject(MAILER) private readonly mailer: B2bMailer,
  ) {}

  handle(event: OrderReadyEvent): void {
    // **Suivi** : cet abonné tourne hors de la requête du comptoir. Sans cette
    // inscription, personne — ni la prod, ni un test — ne sait quand il a fini.
    void this.work.track(this.run(event), "send-order-ready-mail");
  }

  private async run(event: OrderReadyEvent): Promise<void> {
    const owned = await this.orders.findById(event.orderId);
    if (owned === null) {
      return;
    }
    const recipient = await this.recipients.findById(owned.placedByUserId);
    // Un client sans adresse lisible ne doit pas faire échouer un abonné de
    // fond : la commande est prête, c'est le courriel qui manque.
    if (recipient === null) {
      return;
    }

    const client = this.origins.clientBaseUrl();
    const admin = this.origins.adminBaseUrl();
    const token = owned.view.handoverToken;

    await this.mailer.send({
      to: recipient.email,
      template: "customer.order-ready",
      data: {
        sheet: clientSheetOf(owned.view),
        handoverToken: token,
        orderUrl: client === null ? "" : `${client}/mes-commandes`,
        handoverUrl: token === null || admin === null ? "" : `${admin}/retrait/${token}`,
        locale: DEFAULT_MAIL_LOCALE,
      },
      idempotencyKey: `order.ready:${event.orderId}`,
    });
  }
}

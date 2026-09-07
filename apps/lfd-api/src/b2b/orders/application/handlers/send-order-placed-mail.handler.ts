import { Inject } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { DEFAULT_MAIL_LOCALE } from "../../../../platform/mailer/copy/mail-copy.js";
import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import { OrderPlacedEvent } from "../../domain/events/order-placed.event.js";
import { OrderMailOrigins } from "../../domain/ports/order-mail-origins.js";
import { OrderRecipientReader } from "../../domain/ports/order-recipient.reader.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { clientSheetOf } from "../../domain/services/order-sheet.js";

/**
 * **L'accusé de réception d'une commande** — le premier courriel que la
 * plateforme adresse à un client à propos d'une commande.
 *
 * ## Ce qu'il répare
 *
 * Jusqu'ici, une commande passée ne produisait **rien** hors de l'écran. Un
 * client qui fermait l'onglet n'avait plus aucune trace de ce qu'il avait
 * commandé, ni de code à présenter au comptoir sans se reconnecter. L'écran de
 * confirmation avait fini par le dire honnêtement — « gardée dans votre
 * espace » — c'était vrai, et c'était maigre.
 *
 * ## Pourquoi un abonné et pas un appel dans le handler de passation
 *
 * **Un courriel ne doit jamais faire échouer une commande.** Elle est écrite,
 * peut-être payée, et un fournisseur de courrier indisponible ne peut pas
 * défaire ça. L'abonné tourne donc hors de la requête, après persistance, et son
 * échec ne remonte pas au client.
 *
 * ## L'idempotence
 *
 * La clé est **déterministe par commande**. Un événement rejoué — une reprise
 * après un délai d'attente que le fournisseur avait en fait accepté — est
 * dédoublonné chez lui : le client ne reçoit pas deux fois la même confirmation.
 */
@EventsHandler(OrderPlacedEvent)
export class SendOrderPlacedMail implements IEventHandler<OrderPlacedEvent> {
  constructor(
    private readonly orders: OrderReader,
    private readonly recipients: OrderRecipientReader,
    private readonly origins: OrderMailOrigins,
    private readonly work: BackgroundWork,
    @Inject(MAILER) private readonly mailer: B2bMailer,
  ) {}

  handle(event: OrderPlacedEvent): void {
    // **Suivi** : cet abonné tourne hors de la requête HTTP. Sans cette
    // inscription, un test vide la base pendant que l'envoi la lit, et l'échec
    // accuse le test SUIVANT.
    void this.work.track(this.run(event), "send-order-placed-mail");
  }

  private async run(event: OrderPlacedEvent): Promise<void> {
    const [owned, recipient] = await Promise.all([
      this.orders.findById(event.orderId),
      this.recipients.findById(event.placedByUserId),
    ]);
    // Ni l'un ni l'autre ne devrait manquer — la commande vient d'être écrite,
    // et son auteur est authentifié. On sort en silence plutôt que de lever : un
    // abonné qui jette une exception sur une commande valide remplit les
    // journaux d'alertes qui ne désignent rien à corriger.
    if (owned === null || recipient === null) {
      return;
    }

    const client = this.origins.clientBaseUrl();
    const admin = this.origins.adminBaseUrl();
    const token = owned.view.handoverToken;

    await this.mailer.send({
      to: recipient.email,
      template: "customer.order-placed",
      data: {
        // La feuille PROJETÉE, pas la vue : le courriel ne reçoit ni SKU, ni
        // tarif d'entrée, ni nom d'étage tarifaire. Il n'a rien à masquer parce
        // qu'il n'a rien reçu de plus.
        sheet: clientSheetOf(owned.view),
        handoverToken: token,
        // Vide quand l'origine n'est pas configurée : le gabarit omet alors le
        // bouton plutôt que de poser un lien relatif, inerte dans une boîte mail.
        orderUrl: client === null ? "" : `${client}/mes-commandes`,
        // Le QR encode une URL du BACK-OFFICE : c'est l'équipe qui le scanne,
        // pas le client. Sans origine admin configurée, pas de QR — un code qui
        // n'ouvre rien vaut moins qu'un numéro de commande lisible.
        handoverUrl: token === null || admin === null ? "" : `${admin}/retrait/${token}`,
        locale: DEFAULT_MAIL_LOCALE,
      },
      idempotencyKey: `order.placed:${event.orderId}`,
    });
  }
}

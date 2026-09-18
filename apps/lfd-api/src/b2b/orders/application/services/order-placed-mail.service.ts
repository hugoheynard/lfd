import { Inject, Injectable } from "@nestjs/common";

import { DEFAULT_MAIL_LOCALE } from "../../../../platform/mailer/copy/mail-copy.js";
import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import { OrderMailOrigins } from "../../domain/ports/order-mail-origins.js";
import { OrderRecipientReader } from "../../domain/ports/order-recipient.reader.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { clientSheetOf } from "../../domain/services/order-sheet.js";

/**
 * **« Votre commande est enregistrée »** — l'accusé de réception, et le seul
 * endroit qui sache le composer.
 *
 * ## Pourquoi un service, et pas un abonné qui fait tout
 *
 * 🔴 Parce que **deux gestes l'envoient désormais**, et qu'ils n'arrivent pas au
 * même moment (Hugo, 2026-09-17) :
 *
 * - une commande **portée au compte** n'attend rien : son règlement est décidé à
 *   la passation, et le courriel part avec elle ;
 * - une commande **par carte** n'est pas payée quand elle est écrite. Son
 *   courriel attend l'encaissement, donc le webhook Stripe.
 *
 * Les deux disent exactement la même chose au client — même feuille, même QR,
 * mêmes replis quand une origine manque. Les laisser dans deux abonnés aurait
 * garanti qu'un champ ajouté d'un côté manque de l'autre : c'est la raison, mot
 * pour mot, qui a fait naître {@link OrderReadyMail}.
 *
 * ## 🔴 Ce qu'il RÉPARE
 *
 * Le courriel partait à la passation, quel que soit le règlement. Un client dont
 * la carte était refusée trente secondes plus tard avait donc reçu « votre
 * commande entre dans la fournée de demain matin ». Le message était faux, et
 * c'était le seul que le client recevait jamais.
 *
 * ## La clé d'idempotence
 *
 * Déterministe par commande — `order.placed:<id>`. Les deux chemins portent la
 * même : une commande au compte et une commande payée ne peuvent pas produire
 * deux accusés, même si un fait était rejoué.
 */
@Injectable()
export class OrderPlacedMail {
  constructor(
    private readonly orders: OrderReader,
    private readonly recipients: OrderRecipientReader,
    private readonly origins: OrderMailOrigins,
    @Inject(MAILER) private readonly mailer: B2bMailer,
  ) {}

  /**
   * Envoie l'accusé, ou ne fait rien.
   *
   * ⚠️ Rend un booléen plutôt que de lever : les deux appelants sont des abonnés
   * de fond, et une commande ou un destinataire introuvables n'y sont pas des
   * erreurs — c'est une course perdue contre une suppression. Un abonné qui
   * jette remplit les journaux d'alertes qui ne désignent rien à corriger.
   *
   * @returns `true` si le message a été remis au mailer.
   */
  async send(orderId: string): Promise<boolean> {
    const owned = await this.orders.findById(orderId);
    if (owned === null) {
      return false;
    }
    const recipient = await this.recipients.findById(owned.placedByUserId);
    if (recipient === null) {
      return false;
    }

    const client = this.origins.clientBaseUrl();
    const admin = this.origins.adminBaseUrl();
    const token = owned.view.handoverToken;

    await this.mailer.send({
      to: recipient.email,
      template: "customer.order-placed",
      data: {
        // La feuille PROJETÉE, pas la vue : ni SKU, ni tarif d'entrée, ni nom
        // d'étage tarifaire. Le courriel n'a rien à masquer parce qu'il n'a rien
        // reçu de plus.
        sheet: clientSheetOf(owned.view),
        handoverToken: token,
        // Vide quand l'origine n'est pas configurée : le gabarit omet alors le
        // bouton plutôt que de poser un lien relatif, inerte dans une boîte mail.
        orderUrl: client === null ? "" : `${client}/mes-commandes`,
        // Le QR encode une URL du BACK-OFFICE : c'est l'équipe qui le scanne,
        // pas le client. Sans origine admin, pas de QR — un code qui n'ouvre
        // rien vaut moins qu'un numéro de commande lisible.
        handoverUrl: token === null || admin === null ? "" : `${admin}/retrait/${token}`,
        locale: DEFAULT_MAIL_LOCALE,
      },
      idempotencyKey: `order.placed:${orderId}`,
    });
    return true;
  }
}

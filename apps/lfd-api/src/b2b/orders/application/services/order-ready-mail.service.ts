import { Inject, Injectable } from "@nestjs/common";

import { DEFAULT_MAIL_LOCALE } from "../../../../platform/mailer/copy/mail-copy.js";
import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import { OrderMailOrigins } from "../../domain/ports/order-mail-origins.js";
import { OrderRecipientReader } from "../../domain/ports/order-recipient.reader.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { clientSheetOf } from "../../domain/services/order-sheet.js";

/**
 * **« Votre commande vous attend »** — le courriel de retrait, et le seul
 * endroit qui sache le composer.
 *
 * ## Pourquoi un service, et pas deux appelants qui se ressemblent
 *
 * Deux gestes l'envoient : le **colisage**, qui l'annonce une fois ; et le
 * **rappel** du comptoir, qui le renvoie à quelqu'un qui n'est pas venu. Tout
 * le reste est identique — même destinataire, même bon, même QR, mêmes replis
 * quand une adresse manque.
 *
 * Les deux ont vécu séparés pendant une heure, et le risque se nommait tout
 * seul : un champ ajouté d'un côté (le QR, un jour, une ligne d'adresse) ne
 * l'aurait pas été de l'autre — et c'est le rappel, le moins emprunté des deux,
 * qui serait parti amputé.
 *
 * ## 🔴 La clé d'idempotence vient de l'APPELANT
 *
 * Et c'est tout le sujet de ce paramètre. Le colisage veut une clé
 * **déterministe** : un fait rejoué sur un bus en processus ne doit pas faire
 * partir un second message. Le rappel veut exactement l'inverse — il n'existe
 * que pour repartir. Coder la clé ici obligerait à choisir entre les deux, et
 * ce choix appartient au geste, pas au gabarit.
 */
@Injectable()
export class OrderReadyMail {
  constructor(
    private readonly orders: OrderReader,
    private readonly recipients: OrderRecipientReader,
    private readonly origins: OrderMailOrigins,
    @Inject(MAILER) private readonly mailer: B2bMailer,
  ) {}

  /**
   * Envoie, ou ne fait rien si la commande ou son destinataire ont disparu.
   *
   * ⚠️ Rend un booléen plutôt que de lever : l'appelant historique est un
   * abonné de fond, et une commande introuvable n'y est pas une erreur — c'est
   * une course perdue contre une suppression. Le rappel, lui, a déjà vérifié
   * que la commande existe avant d'arriver ici.
   *
   * @returns `true` si le message a été remis au mailer.
   */
  async send(orderId: string, idempotencyKey: string): Promise<boolean> {
    const owned = await this.orders.findById(orderId);
    if (owned === null) {
      return false;
    }
    const recipient = await this.recipients.findById(owned.placedByUserId);
    // Un client sans adresse lisible ne doit pas faire échouer un abonné de
    // fond : la commande est prête, c'est le courriel qui manque.
    if (recipient === null) {
      return false;
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
      idempotencyKey,
    });
    return true;
  }
}

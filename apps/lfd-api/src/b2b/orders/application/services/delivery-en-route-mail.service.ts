import { Inject, Injectable } from "@nestjs/common";
import type { OrderView } from "@lfd/contracts";

import { DEFAULT_MAIL_LOCALE } from "../../../../platform/mailer/copy/mail-copy.js";
import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import { OrderMailOrigins } from "../../domain/ports/order-mail-origins.js";
import { OrderRecipientReader } from "../../domain/ports/order-recipient.reader.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { clientSheetOf } from "../../domain/services/order-sheet.js";

/**
 * **« Votre livraison est en route »** pour UNE commande
 * (`documentation/livraisons/plan-en-route.md`, PL3-D3, PL3-D4).
 *
 * Destinataire : le compte qui a commandé — le contact de livraison n'a pas
 * d'e-mail (L6-C13). La clé d'idempotence est déterministe par commande
 * (`delivery.en_route:<orderId>`) : un départ rejoué ne fait pas partir de
 * second message.
 */
@Injectable()
export class DeliveryEnRouteMail {
  constructor(
    private readonly orders: OrderReader,
    private readonly recipients: OrderRecipientReader,
    private readonly origins: OrderMailOrigins,
    @Inject(MAILER) private readonly mailer: B2bMailer,
  ) {}

  /**
   * Envoie, ou ne fait rien quand il n'y a plus rien à annoncer : commande
   * disparue, **annulée**, **déjà retirée** au moment de l'envoi, ou client
   * sans adresse lisible. Aucun de ces cas n'est une erreur pour un abonné de
   * fond — la tournée est partie, c'est le courriel qui n'a pas d'objet.
   *
   * @returns `true` si le message a été remis au mailer.
   */
  async send(orderId: string): Promise<boolean> {
    const owned = await this.orders.findById(orderId);
    if (owned === null || !stillOnItsWay(owned.view)) {
      return false;
    }
    const recipient = await this.recipients.findById(owned.placedByUserId);
    if (recipient === null) {
      return false;
    }
    const sheet = clientSheetOf(owned.view);
    const address = sheet.fulfillment.address;
    const client = this.origins.clientBaseUrl();
    await this.mailer.send({
      to: recipient.email,
      template: "customer.delivery-en-route",
      data: {
        reference: sheet.reference,
        addressLines:
          address === null
            ? []
            : [address.ligne1, address.ligne2, `${address.codePostal} ${address.ville}`],
        orderUrl: client === null ? "" : `${client}/mes-commandes`,
        locale: DEFAULT_MAIL_LOCALE,
      },
      idempotencyKey: `delivery.en_route:${orderId}`,
    });
    return true;
  }
}

/** Ni annulée, ni déjà retirée — la règle de la porte (`PrismaDeliveryOrderStatesReader`). */
function stillOnItsWay(view: OrderView): boolean {
  return view.status !== "cancelled" && view.status !== "fulfilled" && view.handedOverAt === null;
}

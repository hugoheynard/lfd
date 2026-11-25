import { Injectable } from "@nestjs/common";
import type { OrderView } from "@lfd/contracts";

import { DEFAULT_MAIL_LOCALE } from "../../../../../mail/channels/templates/mail-locale.js";
import { Mail } from "../../../../../mail/channels/requests/mail.js";
import { OrderMailOrigins } from "../../../domain/ports/order-mail-origins.js";
import { OrderRecipientReader } from "../../../domain/ports/order-recipient.reader.js";
import { isCustomerNotified, OrderReader } from "../../../domain/ports/order.reader.js";
import { OrderManageLink } from "../../../application/services/order-manage-link.js";
import { clientSheetOf } from "../../../domain/services/order-sheet.js";

/**
 * **« Votre livraison est en route »** pour UNE commande
 * (`documentation/livraisons/livreur/en-route.md`).
 *
 * Destinataire : le compte qui a commandé — le contact de livraison n'a pas
 * d'e-mail (L6-C13). La clé d'idempotence est déterministe par commande ET
 * par tournée (`delivery.en_route:<orderId>:<roundId>`, `plan-depart-durable.md`,
 * §5) : un fait relivré ne fait pas partir de second message, et une commande
 * rapportée qui repart dans une autre tournée a le sien.
 */
@Injectable()
export class DeliveryEnRouteMail {
  constructor(
    private readonly orders: OrderReader,
    private readonly recipients: OrderRecipientReader,
    private readonly origins: OrderMailOrigins,
    private readonly orderPage: OrderManageLink,
    private readonly mail: Mail,
  ) {}

  /**
   * Envoie, ou ne fait rien quand il n'y a plus rien à annoncer : commande
   * disparue, **annulée**, **déjà retirée** au moment de l'envoi, ou client
   * sans adresse lisible. Aucun de ces cas n'est une erreur pour un abonné de
   * fond — la tournée est partie, c'est le courriel qui n'a pas d'objet.
   *
   * @returns `true` si le message a été remis au mailer.
   */
  async send(orderId: string, roundId: string): Promise<boolean> {
    const owned = await this.orders.findById(orderId);
    if (owned === null || !stillOnItsWay(owned.view)) {
      return false;
    }
    // Une commande offerte qui ne prévient pas le client : aucun e-mail
    // automatique (décidé par Hugo le 2026-11-23, `la-commande-offerte.md`, § 2.9).
    if (!isCustomerNotified(owned)) {
      return false;
    }
    const recipient = await this.recipients.findById(owned.placedByUserId);
    if (recipient === null) {
      return false;
    }
    const sheet = clientSheetOf(owned.view, owned.billedCustomer, owned.buyerPhone, owned.revision);
    const address = sheet.fulfillment.address;
    const client = this.origins.clientBaseUrl();
    await this.mail.send({
      to: recipient.email,
      template: "customer.delivery-en-route",
      data: {
        reference: sheet.reference,
        addressLines:
          address === null
            ? []
            : [address.ligne1, address.ligne2, `${address.codePostal} ${address.ville}`],
        window: sheet.fulfillment.window,
        orderUrl: await this.orderPage.urlFor(orderId, client),
        locale: DEFAULT_MAIL_LOCALE,
      },
      idempotencyKey: `delivery.en_route:${orderId}:${roundId}`,
      subjects: [{ type: "order", id: orderId }],
    });
    return true;
  }
}

/** Ni annulée, ni déjà retirée — la règle de la porte (`PrismaDeliveryOrderStatesReader`). */
function stillOnItsWay(view: OrderView): boolean {
  return view.status !== "cancelled" && view.status !== "fulfilled" && view.handedOverAt === null;
}

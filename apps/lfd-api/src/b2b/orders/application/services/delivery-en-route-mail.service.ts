import { Inject, Injectable } from "@nestjs/common";
import type { OrderView } from "@lfd/contracts";

import { DEFAULT_MAIL_LOCALE } from "../../../../platform/mailer/copy/mail-copy.js";
import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import { OrderMailOrigins } from "../../domain/ports/order-mail-origins.js";
import { OrderRecipientReader } from "../../domain/ports/order-recipient.reader.js";
import { OrderReader, type OwnedOrder } from "../../domain/ports/order.reader.js";
import { RemainderShipmentReader } from "../../domain/ports/remainder-shipment.reader.js";
import {
  FIRST_SHIPMENT_RANK,
  ShipmentRef,
} from "../../../../production/channels/commerce/index.js";
import { clientSheetOf } from "../../domain/services/order-sheet.js";

/**
 * **« Votre livraison est en route »** pour UNE commande
 * (`documentation/livraisons/livreur/en-route.md`).
 *
 * Destinataire : le compte qui a commandé — le contact de livraison n'a pas
 * d'e-mail (L6-C13). La clé d'idempotence est déterministe par commande ET
 * par tournée (`delivery.en_route:<orderId>:<roundId>`, `plan-depart-durable.md`,
 * §5) : un fait relivré ne fait pas partir de second message, et une commande
 * rapportée qui repart dans une autre tournée a le sien.
 *
 * **Par envoi** depuis le lot L4d (plan E7 reliquat, choix 17) : un reste
 * (rang > 1) dit « le reste de votre commande », sa clé gagne `:r<rang>`, et
 * il se tait quand SON BL est remis ou annulé — la commande, elle, est
 * peut-être déjà retirée au rang 1. Le rang 1 est inchangé.
 */
@Injectable()
export class DeliveryEnRouteMail {
  constructor(
    private readonly orders: OrderReader,
    private readonly recipients: OrderRecipientReader,
    private readonly origins: OrderMailOrigins,
    @Inject(MAILER) private readonly mailer: B2bMailer,
    private readonly remainders: RemainderShipmentReader,
  ) {}

  /**
   * Envoie, ou ne fait rien quand il n'y a plus rien à annoncer : commande
   * disparue, **annulée**, envoi **déjà retiré** au moment de l'envoi, ou client
   * sans adresse lisible. Aucun de ces cas n'est une erreur pour un abonné de
   * fond — la tournée est partie, c'est le courriel qui n'a pas d'objet.
   *
   * @returns `true` si le message a été remis au mailer.
   */
  async send(shipment: ShipmentRef, roundId: string): Promise<boolean> {
    const { orderId } = shipment;
    const owned = await this.orders.findById(orderId);
    if (owned === null || !(await this.stillOnItsWay(owned, shipment))) {
      return false;
    }
    const recipient = await this.recipients.findById(owned.placedByUserId);
    if (recipient === null) {
      return false;
    }
    const sheet = clientSheetOf(owned.view, owned.billedCustomer, owned.buyerPhone, owned.revision);
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
        ...(shipment.rank === FIRST_SHIPMENT_RANK ? {} : { remainder: true }),
      },
      idempotencyKey: `delivery.en_route:${orderId}:${roundId}${shipment.keySuffix()}`,
    });
    return true;
  }

  /** Le rang 1 se lit sur la commande ; un reste sur son BL, la commande non annulée. */
  private async stillOnItsWay(owned: OwnedOrder, shipment: ShipmentRef): Promise<boolean> {
    if (shipment.rank === FIRST_SHIPMENT_RANK) {
      return firstStillOnItsWay(owned.view);
    }
    if (owned.view.status === "cancelled") {
      return false;
    }
    const remainder = await this.remainders.find(shipment.orderId, shipment.rank);
    return remainder !== null && !remainder.handedOver;
  }
}

/** Ni annulée, ni déjà retirée — la règle de la porte (`PrismaDeliveryOrderStatesReader`). */
function firstStillOnItsWay(view: OrderView): boolean {
  return view.status !== "cancelled" && view.status !== "fulfilled" && view.handedOverAt === null;
}

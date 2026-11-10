import { Injectable } from "@nestjs/common";

import {
  DELIVERY_ROUND_DEPARTED,
  DeliveryRoundDepartedFact,
} from "../../../../delivery/channels/commerce/index.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { DeliveryEnRouteMail } from "../services/delivery-en-route-mail.service.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const MAIL_DELIVERY_EN_ROUTE = "b2b.mail-delivery-en-route";

/**
 * **« Votre livraison est en route »** — le commerce entend le départ d'une
 * tournée (`documentation/livraisons/livreur/en-route.md`) : un courriel par
 * ENVOI (plan E7 reliquat, choix 17, lot L4d) — le reste d'une commande a le
 * sien, qui dit « le reste de votre commande ».
 *
 * Abonné DURABLE depuis le 2026-10-06 (DD1) : le relais le livre au premier
 * réveil après la validation du départ, et le balayage rattrape un réveil
 * manqué.
 *
 * 🔴 **Les courriels sont DEMANDÉS au bloc `mail`, dans la transaction du
 * reçu** (plan `documentation/mail/plan-service-e-mails.md`,
 * S2a, 2026-11-06). Une demande n'est qu'une écriture : aucun appel au
 * fournisseur ne tient plus la transaction — c'était la raison (audit B1,
 * 2026-10-07) d'envoyer après la validation, au prix de perdre les envois
 * restants à un redémarrage. Le bloc envoie désormais après la validation,
 * et son balayeur reprend un envoi interrompu : plus rien n'est perdu.
 *
 * Une demande qui échoue (la base) fait échouer la livraison, qui sera
 * rejouée ; les demandes déjà faites ne se doublent pas, leur clé est par
 * commande ET par tournée (`DeliveryEnRouteMail`).
 */
@Injectable()
@DurableHandler({ type: DELIVERY_ROUND_DEPARTED, subscriber: MAIL_DELIVERY_EN_ROUTE })
export class MailDeliveryEnRoute implements DurableSubscriber {
  constructor(private readonly mail: DeliveryEnRouteMail) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = DeliveryRoundDepartedFact.fromPayload(delivery.payload);
    // Un courriel par ENVOI (choix 17) ; un envoi répété dans le fait n'en
    // fait partir qu'un.
    const shipments = fact.shipments.filter(
      (shipment, index) => fact.shipments.findIndex((other) => other.equals(shipment)) === index,
    );
    for (const shipment of shipments) {
      await this.mail.send(shipment, fact.roundId);
    }
  }
}

import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { ORDER_READY, OrderReadyFact } from "../../domain/events/order-ready.fact.js";
import { OrderReadyMail } from "../services/order-ready-mail.service.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const SEND_ORDER_READY_MAIL = "orders.send-ready-mail.on-ready";

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
 *
 * ## Durable depuis le 2026-10-10 (lot E5)
 *
 * Il écoutait `OrderReadyEvent` en mémoire, lancé après la validation de la
 * livraison du colisage : un redémarrage à cet instant perdait le courriel,
 * sans ligne à rejouer. Il lit désormais `order.ready`, écrit par
 * `MarkOrderReadyHandler` dans la transaction de `markReady`
 * (`documentation/journalisation/plan-evenements-durables.md`, §7 quater).
 * Rejoué, il ne double rien : la clé du courriel est `order.ready:<orderId>`.
 */
@Injectable()
@DurableHandler({ type: ORDER_READY, subscriber: SEND_ORDER_READY_MAIL })
export class SendOrderReadyMail implements DurableSubscriber {
  constructor(private readonly mail: OrderReadyMail) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = OrderReadyFact.fromPayload(delivery.payload);
    // 🔴 Clé DÉTERMINISTE par commande : un fait rejoué par la boîte d'envoi
    // ne fait pas partir un second message. Le rappel du comptoir, lui, en
    // compose une datée — c'est la même fonction d'envoi, et c'est l'appelant
    // qui choisit s'il se répète.
    await this.mail.send(fact.orderId, `order.ready:${fact.orderId}`);
  }
}

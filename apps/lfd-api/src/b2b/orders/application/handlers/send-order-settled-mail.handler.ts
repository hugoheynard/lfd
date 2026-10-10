import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { ORDER_PAID, OrderPaidFact } from "../../domain/events/order-paid.fact.js";
import { OrderPlacedMail } from "../services/order-placed-mail.service.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const SEND_ORDER_SETTLED_MAIL = "orders.send-settled-mail.on-paid";

/**
 * **L'accusé de réception d'une commande PAYÉE PAR CARTE.**
 *
 * ## Pourquoi il existe
 *
 * 🔴 L'accusé partait à la passation, quel que soit le règlement (Hugo,
 * 2026-09-17 : « je ne veux pas que pour un paiement carte, order placed parte à
 * la passation »). Une commande carte est pourtant écrite **avant** d'être
 * payée : le client dont la carte était refusée ensuite avait donc reçu « votre
 * commande entre dans la fournée de demain matin ».
 *
 * L'accusé attend désormais que le règlement soit acquis. Les deux chemins se
 * partagent {@link OrderPlacedMail} — même feuille, même QR, **même clé
 * d'idempotence** : une commande ne peut pas produire deux accusés, quel que
 * soit le chemin qui l'annonce.
 *
 * ## Durable depuis le 2026-10-10 (lot E4)
 *
 * Il écoutait le fait « réglée » en mémoire : un redémarrage entre l'accusé
 * du webhook et ce saut perdait le courriel, et le bon qu'il joint — Stripe ne
 * rejoue qu'un webhook NON accusé. Il lit désormais `order.paid`, écrit dans la
 * transaction de `markPaid` (`documentation/journalisation/plan-evenements-durables.md`).
 * Rejoué, il ne double rien : la clé d'idempotence du courriel est
 * `order.placed:<orderId>`.
 *
 * Une carte abandonnée n'émet aucun événement Stripe ; elle expire à 30 min
 * (`documentation/order/commande-carte-reglee.md`).
 */
@Injectable()
@DurableHandler({ type: ORDER_PAID, subscriber: SEND_ORDER_SETTLED_MAIL })
export class SendOrderSettledMail implements DurableSubscriber {
  constructor(private readonly mail: OrderPlacedMail) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = OrderPaidFact.fromPayload(delivery.payload);
    await this.mail.send(fact.orderId);
  }
}

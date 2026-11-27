import { Injectable } from "@nestjs/common";

import {
  COMMERCE_ORDER_PLACED,
  CommerceOrderPlacedFact,
} from "../../../../delivery/channels/commerce/commerce-order-placed.fact.js";
import { CardPaymentLabels } from "../../../../payment/channels/requests/index.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { orderCardLabel, placedOrderCardChannel } from "../services/order-card-label.js";
import { orderCardSubject } from "../services/order-card-subject.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const DESCRIBE_CARD_PAYMENT_ON_PLACED = "orders.describe-card-payment.on-placed";

/**
 * **Le numéro de commande chez le prestataire des cartes** (plan
 * `documentation/payment/le-pointage-stripe.md`, § 3). L'intention d'une
 * passation pro, boutique ou staff naît AVANT l'écriture qui attribue le
 * numéro : sa description ne le porte pas. Une fois la commande enregistrée,
 * cet abonné compose le libellé définitif — `LFD · La Folie Coffee <canal> ·
 * Commande n° X · paiement`, `order_number` et `subject_id` — et le confie au
 * bloc `payment`, qui le pose après validation et reprend ce qui échoue.
 *
 * Il écoute `commerce.order_placed`, que toutes les passations écrivent dans
 * leur transaction ; une commande sans intention (différée, au compte,
 * gratuite, au comptoir) ne demande rien. Durable (`lint:durable-cross-block`) :
 * il appelle un port que `payment` implémente. Un fait relivré redit le même
 * libellé, que le bloc ignore. Jamais le paiement n'en dépend.
 */
@Injectable()
@DurableHandler({ type: COMMERCE_ORDER_PLACED, subscriber: DESCRIBE_CARD_PAYMENT_ON_PLACED })
export class DescribeCardPaymentOnOrderPlaced implements DurableSubscriber {
  constructor(
    private readonly orders: OrderReader,
    private readonly labels: CardPaymentLabels,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const { orderId } = CommerceOrderPlacedFact.fromPayload(delivery.payload);
    const order = await this.orders.findById(orderId);
    const providerRef = order?.stripePaymentIntentId ?? null;
    if (order === null || providerRef === null) {
      return;
    }
    const { description, metadata } = orderCardLabel({
      channel: placedOrderCardChannel(order),
      kind: "first",
      orderId: order.view.id,
      orderNumber: order.view.orderNumber,
      payer: null,
    });
    await this.labels.describe(orderCardSubject(order.view.id), providerRef, {
      description,
      metadata,
    });
  }
}

import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { ORDER_PAID, OrderPaidFact } from "../../domain/events/order-paid.fact.js";
import { SendGuestOrderNotice } from "./send-guest-order-notice.handler.js";

export const SEND_GUEST_ORDER_NOTICE_ON_PAID = "orders.send-guest-notice.on-paid";

/** L'avis d'une commande carte : il part quand elle est réglée, pas avant. */
@Injectable()
@DurableHandler({ type: ORDER_PAID, subscriber: SEND_GUEST_ORDER_NOTICE_ON_PAID })
export class SendGuestOrderNoticeOnPaid extends SendGuestOrderNotice implements DurableSubscriber {
  override async handle(delivery: DurableDelivery): Promise<void> {
    const fact = OrderPaidFact.fromPayload(delivery.payload);
    const order = await this.paidOrder(fact.orderId);
    if (order !== null) {
      await this.run(order);
    }
  }
}

import { Injectable } from "@nestjs/common";

import {
  ORDER_PAYMENT_FAILED,
  OrderPaymentFailedEvent,
  type PaymentFailureCause,
} from "../../../orders/domain/events/order-payment-failed.event.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import type { OrderNotice } from "../services/sub-account-notice.dispatcher.js";
import { SubAccountNoticeDispatcher } from "../services/sub-account-notice.dispatcher.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const NOTIFY_PRINCIPAL_ON_PAYMENT_FAILED = "b2b.sub-account-notices.on-payment-failed";

type CauseNotice = Pick<OrderNotice, "kind" | "activity" | "authorOf">;

/**
 * Ce que chaque cause dit au principal. L'abandon n'a pas de fait à lui :
 * `OrderAbandonedEvent` ne va qu'au journal, et c'est `order.payment_failed`
 * (cause `abandoned`) qui est durable — il porte donc la ligne « commande
 * annulée ou abandonnée » du tableau (§1). Seul l'auteur peut abandonner
 * (`order-abandoned.event.ts`) : il n'est pas prévenu.
 *
 * `expired` et `replaced` ne visent que la clientèle `public`
 * (`order-payment-failed.event.ts`), qui n'a pas de principal : rien.
 */
const BY_CAUSE: Readonly<Record<PaymentFailureCause, CauseNotice | null>> = {
  refused: { kind: "payment_failed", activity: "payment_failed", authorOf: () => null },
  day_closed: { kind: "payment_failed", activity: "payment_failed", authorOf: () => null },
  abandoned: {
    kind: "order_cancelled",
    activity: "abandoned",
    authorOf: (summary) => summary.placedByUserId,
  },
  expired: null,
  replaced: null,
};

/**
 * **Le règlement d'une commande de site est mort → son principal est
 * prévenu** (`plan-notifications-sous-comptes.md`, N2) : `payment_failed`
 * s'il en était le payeur, `order_cancelled` pour un abandon.
 */
@Injectable()
@DurableHandler({ type: ORDER_PAYMENT_FAILED, subscriber: NOTIFY_PRINCIPAL_ON_PAYMENT_FAILED })
export class NotifyPrincipalOnPaymentFailed implements DurableSubscriber {
  constructor(private readonly notices: SubAccountNoticeDispatcher) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderPaymentFailedEvent.fromPayload(delivery.payload);
    const notice = BY_CAUSE[event.cause];
    if (notice === null) {
      return;
    }
    await this.notices.notify({ ...notice, eventId: delivery.eventId, orderId: event.orderId });
  }
}

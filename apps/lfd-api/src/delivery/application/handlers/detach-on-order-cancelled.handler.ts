import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import {
  COMMERCE_ORDER_CANCELLED,
  CommerceOrderCancelledFact,
} from "../../channels/commerce/index.js";
import { TransferMembership } from "../transfer-membership.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const DETACH_ON_ORDER_CANCELLED = "delivery.detach-transfer-on-order-cancelled";

/**
 * **Une commande annulée sort de son transfert** (plan du transfert interne,
 * lot T2, décision 4 de Hugo du 2026-10-13) — tant qu'il est prévu. Parti ou
 * reçu : rien ne bouge, une ligne au journal. Idempotent.
 */
@Injectable()
@DurableHandler({ type: COMMERCE_ORDER_CANCELLED, subscriber: DETACH_ON_ORDER_CANCELLED })
export class DetachOnOrderCancelled implements DurableSubscriber {
  constructor(private readonly membership: TransferMembership) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    await this.membership.reconcile(
      CommerceOrderCancelledFact.fromPayload(delivery.payload).orderId,
    );
  }
}

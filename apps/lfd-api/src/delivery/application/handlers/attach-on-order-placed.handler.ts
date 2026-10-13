import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import { COMMERCE_ORDER_PLACED, CommerceOrderPlacedFact } from "../../channels/commerce/index.js";
import { TransferMembership } from "../transfer-membership.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ATTACH_ON_ORDER_PLACED = "delivery.attach-transfer-on-order-placed";

/**
 * **Une commande passée après la clôture rejoint son transfert** (plan du
 * transfert interne, §6.4, lot T2 ; Hugo, 2026-10-13 : un abonné au fait
 * durable plutôt que le port synchrone `InternalTransferDesk`). Un retrait
 * d'un site servi par transfert, pour un jour déjà clos, entre dans le
 * transfert prévu, ou dans un autre si le prévu est parti (Q-T3). Sinon rien :
 * la clôture s'en charge. Idempotent.
 */
@Injectable()
@DurableHandler({ type: COMMERCE_ORDER_PLACED, subscriber: ATTACH_ON_ORDER_PLACED })
export class AttachOnOrderPlaced implements DurableSubscriber {
  constructor(private readonly membership: TransferMembership) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    await this.membership.reconcile(CommerceOrderPlacedFact.fromPayload(delivery.payload).orderId);
  }
}

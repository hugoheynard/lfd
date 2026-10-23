import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import { COMMERCE_ORDER_REVISED, CommerceOrderRevisedFact } from "../../channels/commerce/index.js";
import { TransferMembership } from "../transfer-membership.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const RECONCILE_ON_ORDER_REVISED = "delivery.reconcile-transfer-on-order-revised";

/**
 * **Une commande modifiée retrouve le bon transfert** (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, M1, §9) — la même
 * question que posent la passation (`AttachOnOrderPlaced`) et l'annulation
 * (`DetachOnOrderCancelled`), par le MÊME service : sortie du transfert prévu
 * si son site ou son jour a changé, puis rattachée au bon s'il y a lieu.
 * Rien quand l'acheminement n'a pas bougé. Idempotent.
 */
@Injectable()
@DurableHandler({ type: COMMERCE_ORDER_REVISED, subscriber: RECONCILE_ON_ORDER_REVISED })
export class ReconcileOnOrderRevised implements DurableSubscriber {
  constructor(private readonly membership: TransferMembership) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = CommerceOrderRevisedFact.fromPayload(delivery.payload);
    if (fact.routeChanged) {
      await this.membership.reconcile(fact.orderId);
    }
  }
}

import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { ORDER_PAID, OrderPaidFact } from "../../../orders/domain/events/order-paid.fact.js";
import { CreditOrderPointsCommand } from "../commands/credit-order-points.command.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const CREDIT_POINTS_ON_PAID = "loyalty.credit-points.on-paid";

/**
 * Le règlement vient d'être **acquis** : si la commande était déjà remise,
 * elle est définitive et rapporte ses points (plan D3). Le cas ordinaire au
 * comptoir est l'inverse — payée d'abord, remise ensuite — et c'est alors
 * l'abonné de la remise qui crédite.
 *
 * **Durable depuis le 2026-10-10** (lot E4, `journalisation/plan-evenements-durables.md`) :
 * il écoutait `OrderPaymentSettledEvent` en mémoire, et un redémarrage entre
 * l'accusé du webhook et ce saut perdait les points d'une commande remise puis
 * payée — sans que Stripe, qui ne rejoue qu'un webhook non accusé, ne le
 * rattrape. Il lit désormais `order.paid`, écrit dans la transaction de
 * `markPaid`. Rejoué, il ne crédite pas deux fois : l'index unique
 * `loyalty_ledger_entries_earned_order_key` refuse un second gain.
 */
@Injectable()
@DurableHandler({ type: ORDER_PAID, subscriber: CREDIT_POINTS_ON_PAID })
export class CreditPointsOnPaymentSettled implements DurableSubscriber {
  constructor(private readonly commands: CommandBus) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = OrderPaidFact.fromPayload(delivery.payload);
    await this.commands.execute<CreditOrderPointsCommand, boolean>(
      new CreditOrderPointsCommand(fact.orderId),
    );
  }
}

import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  ORDER_REFUND_SUCCEEDED,
  OrderRefundSucceededFact,
} from "../../../orders/domain/events/order-refund-succeeded.fact.js";
import { ReconcileRefundsCommand } from "../commands/reconcile-refunds.command.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const RECONCILE_REFUNDS_ON_REFUND = "accounting.reconcile-refunds.on-refund";

/**
 * **Un remboursement a réussi : son avoir, si la commande a une facture
 * carte** (plan `facture-carte-et-remboursements.md`). Sans facture encore, rien : le rapprochement qui suit la facture le
 * rattrapera.
 */
@Injectable()
@DurableHandler({ type: ORDER_REFUND_SUCCEEDED, subscriber: RECONCILE_REFUNDS_ON_REFUND })
export class ReconcileRefundsOnRefund implements DurableSubscriber {
  constructor(private readonly commands: CommandBus) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = OrderRefundSucceededFact.fromPayload(delivery.payload);
    await this.commands.execute(new ReconcileRefundsCommand(fact.orderId));
  }
}

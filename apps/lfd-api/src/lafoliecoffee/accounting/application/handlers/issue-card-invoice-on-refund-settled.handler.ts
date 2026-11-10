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
import { IssueCardInvoiceCommand } from "../commands/issue-card-invoice.command.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ISSUE_CARD_INVOICE_ON_REFUND_SETTLED =
  "accounting.issue-card-invoice.on-refund-settled";

/**
 * **Un remboursement a réussi : la facture carte, si elle attendait que
 * l'argent tombe juste** (plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §6.1, lot P1.c). Le troisième réveil de la facture, après l'encaissement et
 * le retrait : une facture `blocked` par un ajustement en cours ou arrêté
 * repart quand il est rendu — par le prestataire ou « rendu autrement ».
 *
 * Même commande que les deux autres déclencheurs, sans effet quand une 380
 * couvre déjà le bon ou que l'argent ne tombe toujours pas juste. À côté de
 * `reconcile-refunds-on-refund`, sur le même fait : l'un rapproche, l'autre
 * facture — la facture émise rapproche à son tour.
 */
@Injectable()
@DurableHandler({
  type: ORDER_REFUND_SUCCEEDED,
  subscriber: ISSUE_CARD_INVOICE_ON_REFUND_SETTLED,
})
export class IssueCardInvoiceOnRefundSettled implements DurableSubscriber {
  constructor(private readonly commands: CommandBus) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = OrderRefundSucceededFact.fromPayload(delivery.payload);
    await this.commands.execute(new IssueCardInvoiceCommand(fact.orderId));
  }
}

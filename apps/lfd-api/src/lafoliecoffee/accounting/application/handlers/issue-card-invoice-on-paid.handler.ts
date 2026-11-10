import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { ORDER_PAID, OrderPaidFact } from "../../../orders/domain/events/order-paid.fact.js";
import { IssueCardInvoiceCommand } from "../commands/issue-card-invoice.command.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ISSUE_CARD_INVOICE_ON_PAID = "accounting.issue-card-invoice.on-paid";

/**
 * **La commande est encaissée : sa facture carte, si elle est déjà retirée**
 * (plan `facture-carte-et-remboursements.md`). Le
 * pendant de `IssueCardInvoiceOnFulfilled` : les deux appellent la même
 * commande, sans effet quand une 380 couvre déjà le bon.
 */
@Injectable()
@DurableHandler({ type: ORDER_PAID, subscriber: ISSUE_CARD_INVOICE_ON_PAID })
export class IssueCardInvoiceOnPaid implements DurableSubscriber {
  constructor(private readonly commands: CommandBus) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = OrderPaidFact.fromPayload(delivery.payload);
    await this.commands.execute(new IssueCardInvoiceCommand(fact.orderId));
  }
}

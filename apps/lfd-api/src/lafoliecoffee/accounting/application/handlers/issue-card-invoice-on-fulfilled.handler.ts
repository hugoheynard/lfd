import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  ORDER_FULFILLED,
  OrderHandedOverEvent,
} from "../../../orders/domain/events/order-handed-over.event.js";
import { IssueCardInvoiceCommand } from "../commands/issue-card-invoice.command.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ISSUE_CARD_INVOICE_ON_FULFILLED = "accounting.issue-card-invoice.on-fulfilled";

/**
 * **La commande est retirée : sa facture carte, si elle est déjà payée**
 * (plan `facture-carte-et-remboursements.md`).
 *
 * Le fait écouté est `order.fulfilled`, celui des COMMANDES — un par commande,
 * écrit par l'écriture gagnante de `markFulfilled` —, pas `handover.handed_over`,
 * qui part à chaque geste du comptoir (réannonces comprises). Même bloc que
 * les commandes : un abonné durable d'un fait de son bloc.
 *
 * La commande ne lève pas sur une facture impossible : elle la signale.
 */
@Injectable()
@DurableHandler({ type: ORDER_FULFILLED, subscriber: ISSUE_CARD_INVOICE_ON_FULFILLED })
export class IssueCardInvoiceOnFulfilled implements DurableSubscriber {
  constructor(private readonly commands: CommandBus) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderHandedOverEvent.fromPayload(delivery.payload);
    await this.commands.execute(new IssueCardInvoiceCommand(event.orderId));
  }
}

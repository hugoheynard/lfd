import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import {
  QuotedOrdersCommitment,
  type QuotedCommitmentReceipt,
} from "../../../accounting/domain/ports/quoted-orders-commitment.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderBudgetCommitmentReceivedEvent } from "../../domain/events/order-budget-commitment-received.event.js";
import { OrderBudgetCommitmentRepository } from "../../domain/ports/order-budget-commitment.repository.js";
import { QuotedOrdersReader } from "../../domain/ports/quoted-orders.reader.js";

/**
 * **Le numéro reçu sur un devis de période, écrit sur ses commandes** (QD6) —
 * l'implémentation, par la commande, du port que la comptabilité déclare.
 *
 * Pour chaque commande, sous le verrou de sa ligne : relire le devis en
 * attente qui la porte, juger par l'agrégat (`acceptQuoted`), écrire, et
 * publier son fait — dans la transaction du geste. Le premier refus défait
 * tout.
 */
@Injectable()
export class QuotedCommitmentAccepting extends QuotedOrdersCommitment {
  constructor(
    private readonly commitments: OrderBudgetCommitmentRepository,
    private readonly quoted: QuotedOrdersReader,
    private readonly durable: DurablePublisher,
    private readonly uow: UnitOfWork,
  ) {
    super();
  }

  /**
   * @throws {OrderNotFoundError} une commande inconnue.
   * @throws voir `OrderBudgetCommitment.acceptQuoted`.
   */
  acceptQuoted(receipt: QuotedCommitmentReceipt): Promise<void> {
    const target = { quoteId: receipt.quoteId, quoteNumber: receipt.quoteNumber };
    return this.uow.run(async () => {
      for (const orderId of receipt.orderIds) {
        const order = await this.commitments.lock(orderId);
        if (order === null) {
          throw new OrderNotFoundError(orderId);
        }
        order.acceptQuoted(receipt.number, target, await this.quoted.awaitingQuoteOf(orderId));
        await this.commitments.save(order);
        const received = order.pendingCommitment;
        if (received === null || received === undefined) {
          continue;
        }
        await this.durable.publish(
          new OrderBudgetCommitmentReceivedEvent(
            order.orderId,
            order.orderNumber,
            order.placedByUserId,
            receipt.staffUserId,
            { id: receipt.quoteId, number: receipt.quoteNumber },
            { number: received.number, serviceCode: received.serviceCode },
          ).durableFact(),
        );
      }
    });
  }
}

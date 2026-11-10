import type { OrderRevisionQuoteView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CustomerRequestNotFoundError } from "../../domain/errors/contact-errors.js";
import { OrderChangeUnreadableError } from "../../domain/errors/order-change-errors.js";
import { CustomerRequestRepository } from "../../domain/ports/customer-request.repository.js";
import { OrderChangeQuoter } from "../../domain/ports/order-change.quoter.js";
import { QuoteOrderChangeQuery } from "./quote-order-change.query.js";

/**
 * Le devis d'une demande de modification en attente : l'écart entre la
 * commande telle qu'elle est et la commande demandée, comme le devis de
 * « Modifier la commande ». Son refus (inscrite au plan, carte, rien qui
 * change…) remonte avec sa phrase : l'écran la montre à la place de l'écart.
 * Lecture pure.
 */
@QueryHandler(QuoteOrderChangeQuery)
export class QuoteOrderChangeHandler implements IQueryHandler<
  QuoteOrderChangeQuery,
  OrderRevisionQuoteView
> {
  constructor(
    private readonly requests: CustomerRequestRepository,
    private readonly quoter: OrderChangeQuoter,
  ) {}

  async execute(query: QuoteOrderChangeQuery): Promise<OrderRevisionQuoteView> {
    const request = await this.requests.load(query.requestId);
    if (request === null) {
      throw new CustomerRequestNotFoundError(query.requestId);
    }
    const pending = request.pendingOrderChange();
    if (pending.change === null) {
      throw new OrderChangeUnreadableError(request.id);
    }
    return this.quoter.quote(pending.order.id, query.staffUserId, pending.change);
  }
}

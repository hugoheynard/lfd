import type { OrderRevisionQuoteView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { QuoteOrderRevisionQuery } from "../../orders/application/queries/quote-order-revision.query.js";
import type { RequestedOrderChange } from "../domain/customer-request-details.js";
import { OrderChangeQuoter } from "../domain/ports/order-change.quoter.js";

/** Le devis d'une modification demandée : le devis de révision de l'équipe, par le bus. */
@Injectable()
export class BusOrderChangeQuoter extends OrderChangeQuoter {
  constructor(private readonly queries: QueryBus) {
    super();
  }

  quote(
    orderId: string,
    staffUserId: string,
    change: RequestedOrderChange,
  ): Promise<OrderRevisionQuoteView> {
    return this.queries.execute<QuoteOrderRevisionQuery, OrderRevisionQuoteView>(
      new QuoteOrderRevisionQuery(orderId, { kind: "staff", staffId: staffUserId }, change),
    );
  }
}

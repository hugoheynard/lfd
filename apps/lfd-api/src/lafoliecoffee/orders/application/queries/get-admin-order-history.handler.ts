import type { ActivityEventView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderHistoryReader } from "../../domain/ports/order-history.reader.js";
import { GetAdminOrderHistoryQuery } from "./get-admin-order-history.query.js";

/**
 * Sert l'historique d'une commande au staff. Une commande inconnue est un 404
 * — le même `OrderNotFoundError` que le détail, donc la même phrase à l'écran.
 */
@QueryHandler(GetAdminOrderHistoryQuery)
export class GetAdminOrderHistoryHandler implements IQueryHandler<
  GetAdminOrderHistoryQuery,
  readonly ActivityEventView[]
> {
  constructor(private readonly history: OrderHistoryReader) {}

  async execute(query: GetAdminOrderHistoryQuery): Promise<readonly ActivityEventView[]> {
    const events = await this.history.historyOf(query.orderId);
    if (events === null) {
      throw new OrderNotFoundError(query.orderId);
    }
    return events;
  }
}

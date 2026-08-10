import type { AdminOrderRow } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderReader } from "../../domain/ports/order.reader.js";
import { ListAdminOrdersQuery } from "./list-admin-orders.query.js";

/** Sert la liste staff des commandes (filtres déjà validés par le contrôleur). */
@QueryHandler(ListAdminOrdersQuery)
export class ListAdminOrdersHandler implements IQueryHandler<
  ListAdminOrdersQuery,
  readonly AdminOrderRow[]
> {
  constructor(private readonly orders: OrderReader) {}

  async execute(query: ListAdminOrdersQuery): Promise<readonly AdminOrderRow[]> {
    return this.orders.listForAdmin(query.filters);
  }
}

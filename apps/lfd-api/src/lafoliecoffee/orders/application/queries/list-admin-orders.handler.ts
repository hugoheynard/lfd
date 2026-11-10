import type { AdminOrdersPage } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { AdminOrderListReader } from "../../domain/ports/admin-order-list.reader.js";
import { AdminOrderCursor } from "../../domain/value-objects/admin-order-cursor.js";
import { adminOrderListCriteriaOf } from "./admin-order-list-criteria.js";
import { ListAdminOrdersQuery } from "./list-admin-orders.query.js";

/**
 * Sert une page de la liste staff des commandes (forme déjà validée par le
 * contrôleur). Le curseur suivant désigne la DERNIÈRE ligne rendue, et n'existe
 * que si le lecteur a vu au-delà.
 */
@QueryHandler(ListAdminOrdersQuery)
export class ListAdminOrdersHandler implements IQueryHandler<
  ListAdminOrdersQuery,
  AdminOrdersPage
> {
  constructor(private readonly orders: AdminOrderListReader) {}

  async execute(query: ListAdminOrdersQuery): Promise<AdminOrdersPage> {
    const slice = await this.orders.page(adminOrderListCriteriaOf(query.filters));
    const last = slice.rows.at(-1);
    return {
      rows: slice.rows,
      nextCursor:
        slice.hasMore && last !== undefined
          ? AdminOrderCursor.after(new Date(last.placedAt), last.id).encode()
          : null,
      total: slice.total,
    };
  }
}

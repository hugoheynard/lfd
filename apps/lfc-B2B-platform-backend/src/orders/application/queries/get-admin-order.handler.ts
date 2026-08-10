import type { OrderView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { GetAdminOrderQuery } from "./get-admin-order.query.js";

/**
 * Sert une commande au staff, telle quelle. Le 404 reste **non divulguant** par
 * cohérence de message, même si ici il n'y a rien à cacher : c'est le même
 * `OrderNotFoundError` des deux côtés, donc le même texte à l'écran.
 */
@QueryHandler(GetAdminOrderQuery)
export class GetAdminOrderHandler implements IQueryHandler<GetAdminOrderQuery, OrderView> {
  constructor(private readonly orders: OrderReader) {}

  async execute(query: GetAdminOrderQuery): Promise<OrderView> {
    const owned = await this.orders.findById(query.orderId);
    if (owned === null) {
      throw new OrderNotFoundError(query.orderId);
    }
    return owned.view;
  }
}

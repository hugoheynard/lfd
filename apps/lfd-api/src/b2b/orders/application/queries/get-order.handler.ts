import type { OrderView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderAccessReader } from "../../domain/ports/order-access.reader.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { ensureOrderVisible } from "../../domain/services/order-access.js";
import { GetOrderQuery } from "./get-order.query.js";

/**
 * Sert **une** commande à qui a le droit de la voir. Deux murs selon le
 * propriétaire lu : personnel (`placedByUserId`) ou entreprise (membre).
 *
 * Le rôle est le rôle EFFECTIF dans la société de la commande
 * (`OrderAccessReader`, lot C1 de `plan-commandes-des-sites.md`) : l'`owner`
 * ou l'`admin` du principal lit la commande d'un site. L'adaptateur rend
 * `null` pour une commande personnelle, qu'on ne lui demande donc pas.
 */
@QueryHandler(GetOrderQuery)
export class GetOrderHandler implements IQueryHandler<GetOrderQuery, OrderView> {
  constructor(
    private readonly access: OrderAccessReader,
    private readonly orders: OrderReader,
  ) {}

  async execute(query: GetOrderQuery): Promise<OrderView> {
    const owned = await this.orders.findById(query.orderId);
    if (owned === null) {
      throw new OrderNotFoundError(query.orderId);
    }
    const role =
      owned.companyId === null ? null : await this.access.accessToOrder(query.actorUserId, owned);

    ensureOrderVisible(owned, query.actorUserId, role, query.orderId);
    return owned.view;
  }
}

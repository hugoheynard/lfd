import type { OrderView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { ensureOrderVisible } from "../../domain/services/order-access.js";
import { GetOrderQuery } from "./get-order.query.js";

/**
 * Sert **une** commande à qui a le droit de la voir. Deux murs selon le
 * propriétaire lu : personnel (`placedByUserId`) ou entreprise (membre).
 *
 * Le rôle n'est demandé au garde-fou **que** si la commande est rattachée à une
 * entreprise : une commande personnelle n'en a aucun à vérifier, et l'interroger
 * quand même serait une requête pour rien.
 */
@QueryHandler(GetOrderQuery)
export class GetOrderHandler implements IQueryHandler<GetOrderQuery, OrderView> {
  constructor(
    private readonly guard: OrderGuardReader,
    private readonly orders: OrderReader,
  ) {}

  async execute(query: GetOrderQuery): Promise<OrderView> {
    const owned = await this.orders.findById(query.orderId);
    if (owned === null) {
      throw new OrderNotFoundError(query.orderId);
    }
    const role =
      owned.companyId === null ? null : await this.guard.roleOf(query.actorUserId, owned.companyId);

    ensureOrderVisible(owned, query.actorUserId, role, query.orderId);
    return owned.view;
  }
}

import type { OrderView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { ensureOrderMember } from "../../domain/services/order-access.js";
import { ListCompanyOrdersQuery } from "./list-company-orders.query.js";

/** Sert les commandes d'une entreprise à l'un de ses membres (mur « membre »). */
@QueryHandler(ListCompanyOrdersQuery)
export class ListCompanyOrdersHandler implements IQueryHandler<
  ListCompanyOrdersQuery,
  readonly OrderView[]
> {
  constructor(
    private readonly guard: OrderGuardReader,
    private readonly orders: OrderReader,
  ) {}

  async execute(query: ListCompanyOrdersQuery): Promise<readonly OrderView[]> {
    const role = await this.guard.roleOf(query.actorUserId, query.companyId);
    ensureOrderMember(role, query.companyId);

    return this.orders.listByCompany(query.companyId);
  }
}

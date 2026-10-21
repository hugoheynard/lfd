import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  CompanyOrderListReader,
  type CompanyOrderEntry,
} from "../../domain/ports/company-order-list.reader.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { ensureOrderMember } from "../../domain/services/order-access.js";
import { ListCompanyOrdersQuery } from "./list-company-orders.query.js";

/**
 * Sert les commandes d'une entreprise à l'un de ses membres (mur « membre »),
 * et celles de ses sites à qui en hérite (lot C1 de
 * `plan-commandes-des-sites.md`) — l'héritage est dans la requête du
 * lecteur, pas ici. Un `orders` ou un `billing` de la société listée n'y voit
 * que les commandes de celle-ci (§7.8).
 */
@QueryHandler(ListCompanyOrdersQuery)
export class ListCompanyOrdersHandler implements IQueryHandler<
  ListCompanyOrdersQuery,
  readonly CompanyOrderEntry[]
> {
  constructor(
    private readonly guard: OrderGuardReader,
    private readonly orders: CompanyOrderListReader,
  ) {}

  async execute(query: ListCompanyOrdersQuery): Promise<readonly CompanyOrderEntry[]> {
    const role = await this.guard.roleOf(query.actorUserId, query.companyId);
    ensureOrderMember(role, query.companyId);

    return this.orders.listFor({
      actorUserId: query.actorUserId,
      companyId: query.companyId,
      site: query.site,
    });
  }
}

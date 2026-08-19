import { type OrderView } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { ListCompanyOrdersQuery } from "../application/queries/list-company-orders.query.js";

/**
 * Commandes d'une **entreprise** — lecture **murée** au niveau **membre**
 * (l'entreprise est dans l'URL, vérifiée contre les memberships du demandeur).
 * La passation, elle, passe par `POST /orders` (entreprise optionnelle dans le
 * corps) — voir {@link OrdersController}.
 */
@Controller("companies")
export class CompanyOrdersController {
  constructor(private readonly queries: QueryBus) {}

  /** Liste les commandes de l'entreprise (membre). */
  @Get(":companyId/orders")
  async list(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
  ): Promise<readonly OrderView[]> {
    return this.queries.execute<ListCompanyOrdersQuery, readonly OrderView[]>(
      new ListCompanyOrdersQuery(user.userId, companyId),
    );
  }
}

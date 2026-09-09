import { type CustomerOrderView, type OrderView, toCustomerOrder } from "@lfd/contracts";
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

  /**
   * Liste les commandes de l'entreprise (membre).
   *
   * 🔴 **Rétrécie** — cf. {@link OrdersController.mine}. Le mur de cette route
   * protège une entreprise d'une autre ; il ne protégeait pas la machinerie de
   * nos prix contre le membre lui-même. Le back-office ne passe pas par ici : il
   * lit `/admin/orders/*`, qui sert la trace entière.
   */
  @Get(":companyId/orders")
  async list(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
  ): Promise<readonly CustomerOrderView[]> {
    const orders = await this.queries.execute<ListCompanyOrdersQuery, readonly OrderView[]>(
      new ListCompanyOrdersQuery(user.userId, companyId),
    );
    return orders.map(toCustomerOrder);
  }
}

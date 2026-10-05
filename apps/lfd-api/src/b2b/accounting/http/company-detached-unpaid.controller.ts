import type { DetachedUnpaidOrdersView } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { GetMyDetachedUnpaidOrdersQuery } from "../application/queries/detached-unpaid-queries.js";

/**
 * Surface **client** des impayés de sites détachés (`plan-sous-comptes.md`
 * §2.1 quater) : le principal voit ce qu'il reste à régler à la main. Le mur
 * (détenteur ou facturation ; non-membre 404, autre rôle 403) vit dans le
 * handler.
 */
@Controller("companies")
export class CompanyDetachedUnpaidController {
  constructor(private readonly queries: QueryBus) {}

  @Get(":companyId/detached-unpaid-orders")
  async read(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
  ): Promise<DetachedUnpaidOrdersView> {
    return this.queries.execute<GetMyDetachedUnpaidOrdersQuery, DetachedUnpaidOrdersView>(
      new GetMyDetachedUnpaidOrdersQuery(user.userId, companyId),
    );
  }
}

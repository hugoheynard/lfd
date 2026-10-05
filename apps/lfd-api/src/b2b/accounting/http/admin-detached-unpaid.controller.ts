import type { DetachedUnpaidOrdersView } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import {
  AdminSurface,
  RequireAnyPermission,
} from "../../../platform/auth/admin-surface.decorator.js";
import { GetDetachedUnpaidOrdersQuery } from "../application/queries/detached-unpaid-queries.js";

/**
 * Surface **staff** des impayés de sites détachés (`plan-sous-comptes.md`
 * §2.1 quater). Comme le relevé, la lecture s'ouvre à la comptabilité OU à la
 * fiche client : elle s'affiche sur la fiche du site et sur celle du principal.
 */
@Controller("admin/accounting/detached-unpaid")
@AdminSurface("b2b_accounting")
export class AdminDetachedUnpaidController {
  constructor(private readonly queries: QueryBus) {}

  /** Ce que `:companyId` a commandé en site détaché, ou réglait en principal. */
  @Get("companies/:companyId")
  @RequireAnyPermission("b2b_accounting:read", "b2b_companies:read")
  async ofCompany(@Param("companyId") companyId: string): Promise<DetachedUnpaidOrdersView> {
    return this.queries.execute<GetDetachedUnpaidOrdersQuery, DetachedUnpaidOrdersView>(
      new GetDetachedUnpaidOrdersQuery(companyId),
    );
  }
}

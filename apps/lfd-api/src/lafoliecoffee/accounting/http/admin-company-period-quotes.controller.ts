import type { CompanyPeriodQuotesView } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ListCompanyPeriodQuotesQuery } from "../application/queries/list-company-period-quotes.query.js";

/**
 * Les devis de période d'une **fiche client** (plan
 * `plan-clients-publics-chorus.md`, § 6 sexies, QD7), sous
 * `b2b_accounting:read` : ceux du payeur de la société — elle-même, ou le
 * principal qu'un site suit.
 */
@Controller("admin/companies")
@AdminSurface("b2b_accounting")
export class AdminCompanyPeriodQuotesController {
  constructor(private readonly queries: QueryBus) {}

  @Get(":companyId/period-quotes")
  list(@Param("companyId") companyId: string): Promise<CompanyPeriodQuotesView> {
    return this.queries.execute<ListCompanyPeriodQuotesQuery, CompanyPeriodQuotesView>(
      new ListCompanyPeriodQuotesQuery(companyId),
    );
  }
}

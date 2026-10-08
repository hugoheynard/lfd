import type { BillingStatementView } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { GetBillingStatementQuery } from "../application/queries/billing-statement-queries.js";

/**
 * Surface **staff** des arrêtés de facturation (plan
 * `plan-le-prelevement-suit-la-facture.md`, F4). Lecture seule, sous
 * `b2b_accounting:read` : l'arrêté s'écrit et s'annule avec son lot, jamais ici.
 * `404` pour un arrêté inconnu.
 */
@Controller("admin/accounting/billing-statements")
@AdminSurface("b2b_accounting")
export class AdminBillingStatementsController {
  constructor(private readonly queries: QueryBus) {}

  @Get(":statementId")
  statement(@Param("statementId") statementId: string): Promise<BillingStatementView> {
    return this.queries.execute<GetBillingStatementQuery, BillingStatementView>(
      new GetBillingStatementQuery(statementId),
    );
  }
}

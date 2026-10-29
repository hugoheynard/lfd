import type { SaleReferenceDecisionView } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ListSaleReferenceDecisionsQuery } from "../application/queries/list-sale-reference-decisions.query.js";

/**
 * **Les décisions tarifaires debout sur une référence de vente**
 * (`plan-pro-voit-les-declinaisons.md`, L7) — la liste que la fiche née d'un
 * détachement montre pour son ancienne référence. Lecture seule.
 */
@Controller("admin/pricing/sale-references")
@AdminSurface("b2b_pricing")
export class AdminSaleReferenceDecisionsController {
  constructor(private readonly queries: QueryBus) {}

  @Get(":sku/decisions")
  async list(@Param("sku") sku: string): Promise<readonly SaleReferenceDecisionView[]> {
    return this.queries.execute<
      ListSaleReferenceDecisionsQuery,
      readonly SaleReferenceDecisionView[]
    >(new ListSaleReferenceDecisionsQuery(sku));
  }
}

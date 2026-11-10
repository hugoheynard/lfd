import type { CompanyOrderSummaryView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CompanyOrderSummaryReader } from "../../domain/ports/company-order-summary.reader.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { loadCompanyOrderSummary } from "./company-order-summary-support.js";
import { SummarizeCompanyOrdersQuery } from "./summarize-company-orders.query.js";

/**
 * Récapitule des commandes sélectionnées (`plan-recapitulatif-des-commandes.md`,
 * §6) — le format `json`. Garde, plafond, lecture et agrégation sont ceux de
 * {@link loadCompanyOrderSummary}, partagés avec le PDF et le tableur.
 */
@QueryHandler(SummarizeCompanyOrdersQuery)
export class SummarizeCompanyOrdersHandler implements IQueryHandler<
  SummarizeCompanyOrdersQuery,
  CompanyOrderSummaryView
> {
  constructor(
    private readonly guard: OrderGuardReader,
    private readonly orders: CompanyOrderSummaryReader,
  ) {}

  async execute(query: SummarizeCompanyOrdersQuery): Promise<CompanyOrderSummaryView> {
    return loadCompanyOrderSummary(this.guard, this.orders, query);
  }
}

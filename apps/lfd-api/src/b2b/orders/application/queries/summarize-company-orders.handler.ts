import type { CompanyOrderSummaryView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CompanyOrderSummaryReader } from "../../domain/ports/company-order-summary.reader.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { ensureOrderMember } from "../../domain/services/order-access.js";
import {
  ensureAllSummarized,
  summarizeOrders,
  summarySelectionOf,
} from "../../domain/services/order-summary.js";
import { SummarizeCompanyOrdersQuery } from "./summarize-company-orders.query.js";

/**
 * Récapitule des commandes sélectionnées (`plan-recapitulatif-des-commandes.md`,
 * §6) : membre de la société d'abord, plafond ensuite — les deux AVANT toute
 * lecture —, puis UNE lecture sous le mur de la liste. Un id absent du
 * résultat est hors du mur : refus qui le nomme, jamais un récapitulatif
 * partiel. L'agrégation est celle du domaine.
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
    const role = await this.guard.roleOf(query.actorUserId, query.companyId);
    ensureOrderMember(role, query.companyId);
    const orderIds = summarySelectionOf(query.orderIds);

    const sources = await this.orders.ordersFor({
      actorUserId: query.actorUserId,
      companyId: query.companyId,
      orderIds,
    });
    ensureAllSummarized(orderIds, sources);
    return summarizeOrders(query.companyId, sources);
  }
}

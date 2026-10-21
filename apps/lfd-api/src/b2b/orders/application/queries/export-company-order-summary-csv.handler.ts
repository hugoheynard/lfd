import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { CompanyOrderSummaryReader } from "../../domain/ports/company-order-summary.reader.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { OrderSummaryRequesterReader } from "../../domain/ports/order-summary-requester.reader.js";
import { renderOrderSummaryCsv } from "../../domain/services/order-summary-csv.js";
import { orderSummaryFileName } from "../../domain/services/order-summary-paper.js";
import {
  loadCompanyOrderSummary,
  summaryPeriodOf,
  summaryRequesterName,
} from "./company-order-summary-support.js";
import { ExportCompanyOrderSummaryCsvQuery } from "./export-company-order-summary-csv.query.js";

/** Ce que la route sert : le texte du tableur et son nom. */
export interface CompanyOrderSummaryCsvFile {
  readonly fileName: string;
  readonly csv: string;
}

/**
 * **Le récapitulatif au tableur** (`plan-recapitulatif-des-commandes.md`, lot
 * R2) : le même récapitulatif que l'écran — mêmes refus —, daté par le `Clock`.
 */
@QueryHandler(ExportCompanyOrderSummaryCsvQuery)
export class ExportCompanyOrderSummaryCsvHandler implements IQueryHandler<
  ExportCompanyOrderSummaryCsvQuery,
  CompanyOrderSummaryCsvFile
> {
  constructor(
    private readonly guard: OrderGuardReader,
    private readonly orders: CompanyOrderSummaryReader,
    private readonly requester: OrderSummaryRequesterReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: ExportCompanyOrderSummaryCsvQuery): Promise<CompanyOrderSummaryCsvFile> {
    const period = summaryPeriodOf(query.period);
    const summary = await loadCompanyOrderSummary(this.guard, this.orders, query);
    const requesterName = await summaryRequesterName(this.requester, query.companyId);
    const paper = { summary, requesterName, generatedAt: this.clock.now(), period };
    return { fileName: orderSummaryFileName(paper, "csv"), csv: renderOrderSummaryCsv(paper) };
  }
}

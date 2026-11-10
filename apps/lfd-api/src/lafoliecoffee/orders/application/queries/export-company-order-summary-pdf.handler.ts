import type { Buffer } from "node:buffer";

import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { BrandLogoSource } from "../../../../platform/brand/brand-logo.source.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CompanyOrderSummaryReader } from "../../domain/ports/company-order-summary.reader.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { OrderSummaryRequesterReader } from "../../domain/ports/order-summary-requester.reader.js";
import { orderSummaryFileName } from "../../domain/services/order-summary-paper.js";
import { renderOrderSummaryPdf } from "../../domain/services/order-summary-pdf.js";
import {
  loadCompanyOrderSummary,
  summaryPeriodOf,
  summaryRequesterName,
} from "./company-order-summary-support.js";
import { ExportCompanyOrderSummaryPdfQuery } from "./export-company-order-summary-pdf.query.js";

/** Ce que la route sert : les octets et leur nom. */
export interface CompanyOrderSummaryPdfFile {
  readonly fileName: string;
  readonly bytes: Buffer;
}

/**
 * **Imprime le récapitulatif** (`plan-recapitulatif-des-commandes.md`, lot R2) :
 * le même récapitulatif que l'écran — mêmes refus —, daté par le `Clock`, le
 * logo lu par le port de la marque, comme la matrice des allergènes.
 *
 * @throws {BrandLogoUnavailableError} le logo manque sur le disque.
 */
@QueryHandler(ExportCompanyOrderSummaryPdfQuery)
export class ExportCompanyOrderSummaryPdfHandler implements IQueryHandler<
  ExportCompanyOrderSummaryPdfQuery,
  CompanyOrderSummaryPdfFile
> {
  constructor(
    private readonly guard: OrderGuardReader,
    private readonly orders: CompanyOrderSummaryReader,
    private readonly requester: OrderSummaryRequesterReader,
    private readonly logo: BrandLogoSource,
    private readonly clock: Clock,
  ) {}

  async execute(query: ExportCompanyOrderSummaryPdfQuery): Promise<CompanyOrderSummaryPdfFile> {
    const period = summaryPeriodOf(query.period);
    const summary = await loadCompanyOrderSummary(this.guard, this.orders, query);
    const [requesterName, logo] = await Promise.all([
      summaryRequesterName(this.requester, query.companyId),
      this.logo.load(),
    ]);
    const paper = { summary, requesterName, generatedAt: this.clock.now(), period };
    return {
      fileName: orderSummaryFileName(paper, "pdf"),
      bytes: await renderOrderSummaryPdf(paper, logo),
    };
  }
}

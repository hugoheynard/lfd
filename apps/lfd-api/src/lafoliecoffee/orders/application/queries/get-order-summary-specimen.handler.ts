import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BrandLogoSource } from "../../../../platform/brand/brand-logo.source.js";
import { Clock } from "../../../../platform/time/clock.js";
import { renderOrderSummaryPdf } from "../../domain/services/order-summary-pdf.js";
import { specimenOrderSummaryPaper } from "../document-specimens/specimen-order-summary.js";
import type { CompanyOrderSummaryPdfFile } from "./export-company-order-summary-pdf.handler.js";
import { GetOrderSummarySpecimenQuery } from "./get-order-summary-specimen.query.js";

/**
 * **Rend le récapitulatif d'exemple** par le rendu même des vrais
 * récapitulatifs (`renderOrderSummaryPdf`), daté par le `Clock`, le logo lu
 * par le port de la marque — comme l'export d'une vraie sélection, sans le
 * mur de la société ni la lecture des commandes, qu'un exemple n'a pas.
 *
 * @throws {BrandLogoUnavailableError} le logo manque sur le disque.
 */
@QueryHandler(GetOrderSummarySpecimenQuery)
export class GetOrderSummarySpecimenHandler implements IQueryHandler<
  GetOrderSummarySpecimenQuery,
  CompanyOrderSummaryPdfFile
> {
  constructor(
    private readonly clock: Clock,
    private readonly logo: BrandLogoSource,
  ) {}

  async execute(): Promise<CompanyOrderSummaryPdfFile> {
    const paper = specimenOrderSummaryPaper(this.clock.now());
    const bytes = await renderOrderSummaryPdf(paper, await this.logo.load());
    return { bytes, fileName: "exemple-recapitulatif-de-commandes.pdf" };
  }
}

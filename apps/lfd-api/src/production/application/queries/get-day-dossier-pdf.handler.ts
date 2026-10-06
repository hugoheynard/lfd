import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { ProductionPapers, type ProductionPaper } from "../services/production-paper.service.js";
import { GetDayDossierPdfQuery } from "./get-day-dossier-pdf.query.js";

/**
 * Le dossier du jour — refusé tant que la journée n'est pas arrêtée : il se lit
 * dans ce qu'elle a figé, et c'est ce papier-là qui part au fournil.
 */
@QueryHandler(GetDayDossierPdfQuery)
export class GetDayDossierPdfHandler implements IQueryHandler<
  GetDayDossierPdfQuery,
  ProductionPaper
> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly papers: ProductionPapers,
  ) {}

  async execute(query: GetDayDossierPdfQuery): Promise<ProductionPaper> {
    const day = await this.days.load(ServiceDay.of(query.serviceDay));
    return this.papers.dossierOf(day);
  }
}

import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { ProductionPapers, type ProductionPaper } from "../services/production-paper.service.js";
import { GetProductionCountPdfQuery } from "./get-production-count-pdf.query.js";

/** Le compte à produire du jour — refusé tant que la journée n'est pas arrêtée. */
@QueryHandler(GetProductionCountPdfQuery)
export class GetProductionCountPdfHandler implements IQueryHandler<
  GetProductionCountPdfQuery,
  ProductionPaper
> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly papers: ProductionPapers,
  ) {}

  async execute(query: GetProductionCountPdfQuery): Promise<ProductionPaper> {
    const day = await this.days.load(ServiceDay.of(query.serviceDay));
    return this.papers.countOf(day);
  }
}

import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ProductionDayRepository } from "../../day/index.js";
import { ServiceDay } from "../../day/index.js";
import { ProductionPaperArchive, type ProductionPaper } from "../../shared/print/index.js";
import {
  ProductionPaperRenderer,
  productionCountSlotOf,
} from "../services/production-paper.service.js";
import { GetProductionCountPdfQuery } from "./get-production-count-pdf.query.js";

/** Le compte à produire du jour — refusé tant que la journée n'est pas arrêtée. */
@QueryHandler(GetProductionCountPdfQuery)
export class GetProductionCountPdfHandler implements IQueryHandler<
  GetProductionCountPdfQuery,
  ProductionPaper
> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly renderer: ProductionPaperRenderer,
    private readonly archive: ProductionPaperArchive,
  ) {}

  async execute(query: GetProductionCountPdfQuery): Promise<ProductionPaper> {
    const day = await this.days.load(ServiceDay.of(query.serviceDay));
    return this.archive.storedOr(productionCountSlotOf(day), () => this.renderer.countOf(day));
  }
}

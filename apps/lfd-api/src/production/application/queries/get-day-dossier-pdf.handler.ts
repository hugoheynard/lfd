import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ProductionDayRepository } from "../../day/index.js";
import { ServiceDay } from "../../day/index.js";
import { ProductionPaperArchive, type ProductionPaper } from "../../shared/print/index.js";
import { ProductionPaperRenderer, dayDossierSlotOf } from "../services/production-paper.service.js";
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
    private readonly renderer: ProductionPaperRenderer,
    private readonly archive: ProductionPaperArchive,
  ) {}

  async execute(query: GetDayDossierPdfQuery): Promise<ProductionPaper> {
    const day = await this.days.load(ServiceDay.of(query.serviceDay));
    return this.archive.storedOr(dayDossierSlotOf(day), () => this.renderer.dossierOf(day));
  }
}

import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { AtelierSheetNotFoundError, ProductionDayNotClosedError } from "../../../day/index.js";
import { ProductionDayRepository } from "../../../day/index.js";
import { ServiceDay } from "../../../day/index.js";
import {
  OrderSheetPaper,
  ProductionPaperArchive,
  atelierSheetSlotOf,
  type ProductionPaper,
} from "../../../shared/print/index.js";
import { GetAtelierSheetPdfQuery } from "./get-atelier-sheet-pdf.query.js";

/**
 * La feuille d'atelier d'une commande.
 *
 * Elle se lit **dans la journée**, jamais dans le commerce : c'est ce que la
 * production a inscrit à la clôture, et c'est ce papier-là qui est parti au
 * fournil. Relire la commande d'aujourd'hui donnerait une autre feuille dès
 * qu'un avenant existera.
 */
@QueryHandler(GetAtelierSheetPdfQuery)
export class GetAtelierSheetPdfHandler implements IQueryHandler<
  GetAtelierSheetPdfQuery,
  ProductionPaper
> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly sheets: OrderSheetPaper,
    private readonly archive: ProductionPaperArchive,
  ) {}

  async execute(query: GetAtelierSheetPdfQuery): Promise<ProductionPaper> {
    const day = await this.days.load(ServiceDay.of(query.serviceDay));
    const closedAt = day.closedAt;
    if (closedAt === null) {
      throw new ProductionDayNotClosedError(query.serviceDay);
    }
    const order = day.orders.find((candidate) => candidate.reference === query.reference);
    if (order === undefined) {
      throw new AtelierSheetNotFoundError(query.reference, query.serviceDay);
    }
    return this.archive.storedOr(atelierSheetSlotOf(order), () =>
      this.sheets.sheetOf(order, query.serviceDay, closedAt),
    );
  }
}

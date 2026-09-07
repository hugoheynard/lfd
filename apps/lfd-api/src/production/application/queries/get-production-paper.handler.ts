import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ProductionDayNotClosedError } from "../../domain/errors/production-errors.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { ProductionPapers, type ProductionPaper } from "../services/production-paper.service.js";
import {
  GetAtelierSheetPdfQuery,
  GetProductionCountPdfQuery,
} from "./get-production-paper.query.js";
import { AtelierSheetNotFoundError } from "../../domain/errors/production-errors.js";

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
    private readonly papers: ProductionPapers,
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
    return this.papers.sheetOf(order, query.serviceDay, closedAt);
  }
}

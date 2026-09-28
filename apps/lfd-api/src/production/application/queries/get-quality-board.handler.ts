import type { QualityBoardView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { QualityCheckReader } from "../../domain/ports/quality-check.reader.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { qualityBoardOf } from "../services/quality-views.js";
import { GetQualityBoardQuery } from "./get-quality-board.query.js";

/**
 * Deux lectures — la journée (compte et plan) et ses contrôles —, une
 * dérivation pure. Une journée ouverte rend une vue vide sans lever : rien n'y
 * est encore contrôlable. Il n'écrit rien — §4.
 */
@QueryHandler(GetQualityBoardQuery)
export class GetQualityBoardHandler implements IQueryHandler<
  GetQualityBoardQuery,
  QualityBoardView
> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly checks: QualityCheckReader,
  ) {}

  async execute(query: GetQualityBoardQuery): Promise<QualityBoardView> {
    const day = ServiceDay.of(query.serviceDay);
    const [current, checks] = await Promise.all([this.days.load(day), this.checks.forDay(day)]);
    return qualityBoardOf(current, checks);
  }
}

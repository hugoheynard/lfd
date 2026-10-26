import type { QualityBoardView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { QualityControlSettings } from "../../domain/entities/quality-control-settings.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { QualityCheckReader } from "../../domain/ports/quality-check.reader.js";
import { QualityControlSettingsReader } from "../../domain/ports/quality-control-settings.reader.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { qualityBoardOf } from "../services/quality-views.js";
import { GetQualityBoardQuery } from "./get-quality-board.query.js";

/**
 * Trois lectures — la journée (compte et plan), ses contrôles, et où le
 * contrôle se rend (Réglages › Commandes, 2026-10-26) —, une dérivation pure. Une journée ouverte rend une vue vide sans lever : rien n'y
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
    private readonly settings: QualityControlSettingsReader,
  ) {}

  async execute(query: GetQualityBoardQuery): Promise<QualityBoardView> {
    const day = ServiceDay.of(query.serviceDay);
    const [current, checks, posed] = await Promise.all([
      this.days.load(day),
      this.checks.forDay(day),
      this.settings.current(),
    ]);
    return qualityBoardOf(current, checks, posed ?? QualityControlSettings.defaults());
  }
}

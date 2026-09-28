import type { DayVersionView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ProductionDayVersionReader } from "../../domain/ports/production-day-version.reader.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { GetProductionDayVersionQuery } from "./get-production-day-version.query.js";

/**
 * **La journée du fournil a-t-elle bougé ?** — la question qu'un poste pose
 * toutes les 15 s au lieu de tout relire
 * (`documentation/caching-usage/plan-version-par-journee.md`, V2).
 *
 * Une opération. Le numéro avance par les déclencheurs de la base, quel que
 * soit l'écrivain (D1) : ce handler ne fait que le lire.
 */
@QueryHandler(GetProductionDayVersionQuery)
export class GetProductionDayVersionHandler implements IQueryHandler<
  GetProductionDayVersionQuery,
  DayVersionView
> {
  constructor(private readonly versions: ProductionDayVersionReader) {}

  async execute(query: GetProductionDayVersionQuery): Promise<DayVersionView> {
    const day = ServiceDay.of(query.serviceDay);
    return { date: day.value, version: await this.versions.versionOf(day) };
  }
}

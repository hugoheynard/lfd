import type { DayVersionView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderDayVersionReader } from "../../domain/ports/order-day-version.reader.js";
import { GetSupervisionDayVersionQuery } from "./get-supervision-day-version.query.js";

/**
 * **Les commandes du jour ont-elles bougé ?** — la question que la Supervision
 * et le comptoir posent toutes les 15 s au lieu de tout relire
 * (`documentation/caching-usage/plan-version-par-journee.md`, V2).
 *
 * Une opération. Le numéro avance par les déclencheurs de `orders`, quel que
 * soit l'écrivain — passation, règlement, annulation, retrait (D1).
 */
@QueryHandler(GetSupervisionDayVersionQuery)
export class GetSupervisionDayVersionHandler implements IQueryHandler<
  GetSupervisionDayVersionQuery,
  DayVersionView
> {
  constructor(private readonly versions: OrderDayVersionReader) {}

  async execute(query: GetSupervisionDayVersionQuery): Promise<DayVersionView> {
    return { date: query.day, version: await this.versions.versionOf(query.day) };
  }
}

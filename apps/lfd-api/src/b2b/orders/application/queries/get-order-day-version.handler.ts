import type { DayVersionView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderDayVersionReader } from "../../domain/ports/order-day-version.reader.js";
import { GetOrderDayVersionQuery } from "./get-order-day-version.query.js";

/**
 * **Les commandes du jour ont-elles bougé ?** — la question que la Supervision
 * et le comptoir posent toutes les 15 s au lieu de tout relire
 * (`documentation/caching-usage/plan-version-par-journee.md`, V2).
 *
 * Une opération. Le numéro avance par les déclencheurs de `orders`, quel que
 * soit l'écrivain — passation, règlement, annulation, retrait (D1).
 */
@QueryHandler(GetOrderDayVersionQuery)
export class GetOrderDayVersionHandler implements IQueryHandler<
  GetOrderDayVersionQuery,
  DayVersionView
> {
  constructor(private readonly versions: OrderDayVersionReader) {}

  async execute(query: GetOrderDayVersionQuery): Promise<DayVersionView> {
    return { date: query.day, version: await this.versions.versionOf(query.day) };
  }
}

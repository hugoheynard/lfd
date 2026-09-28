import { type DayVersionQuery, type DayVersionView, dayVersionQuerySchema } from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { GetProductionDayVersionQuery } from "../application/queries/get-production-day-version.query.js";

/**
 * **La version d'une journée du fournil**
 * (`documentation/caching-usage/plan-version-par-journee.md`, D3 et V2).
 *
 * `b2b_orders`, comme les postes qui la demandent — la fiche d'atelier et le
 * colisage. Une opération au lieu d'une relecture complète : le poste ne
 * relit sa journée que si ce numéro a changé.
 */
@Controller("admin/production")
@AdminSurface("b2b_orders")
export class ProductionDayVersionController {
  constructor(private readonly queries: QueryBus) {}

  @Get("version")
  version(
    @Query(new ZodQuery(dayVersionQuerySchema)) query: DayVersionQuery,
  ): Promise<DayVersionView> {
    return this.queries.execute<GetProductionDayVersionQuery, DayVersionView>(
      new GetProductionDayVersionQuery(query.date),
    );
  }
}

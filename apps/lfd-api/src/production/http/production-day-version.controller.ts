import { type DayVersionQuery, type DayVersionView, dayVersionQuerySchema } from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequireAnyPermission } from "../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { GetProductionDayVersionQuery } from "../application/queries/get-production-day-version.query.js";

/**
 * **La version d'une journée du fournil**
 * (`documentation/caching-usage/plan-version-par-journee.md`, D3 et V2).
 *
 * Ouverte à **n'importe laquelle** des quatre ressources du fournil
 * (2026-10-01, `documentation/livraisons/droits/plan-droits-par-geste.md`, DG-D1) : c'est un numéro technique
 * dont tout poste a besoin, et exiger l'une fermerait les autres. Une
 * opération au lieu d'une relecture complète : le poste ne relit sa journée
 * que si ce numéro a changé.
 */
@Controller("admin/production")
@AdminSurface("production_plan")
export class ProductionDayVersionController {
  constructor(private readonly queries: QueryBus) {}

  @Get("version")
  @RequireAnyPermission(
    "production_plan:read",
    "production_worksheet:read",
    "production_packing:read",
    "handover_counter:read",
  )
  version(
    @Query(new ZodQuery(dayVersionQuerySchema)) query: DayVersionQuery,
  ): Promise<DayVersionView> {
    return this.queries.execute<GetProductionDayVersionQuery, DayVersionView>(
      new GetProductionDayVersionQuery(query.date),
    );
  }
}

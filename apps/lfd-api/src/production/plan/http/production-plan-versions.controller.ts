import {
  type DossierDispatchView,
  type PlanVersionDiffView,
  type PlanVersionRangeQuery,
  type PlanVersionView,
  planVersionRangeQuerySchema,
  productionBatchQuerySchema,
} from "@lfd/contracts";
import { Controller, Get, Param, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodParam, ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { ComparePlanVersionsQuery } from "../application/queries/compare-plan-versions.query.js";
import { ListDossierDispatchesQuery } from "../application/queries/list-dossier-dispatches.query.js";
import { ListPlanVersionsQuery } from "../application/queries/list-plan-versions.query.js";

const DAY = new ZodParam(productionBatchQuerySchema.shape.date, "date");

/**
 * **Les versions du plan d'une journée** — la liste, la comparaison de deux
 * versions et les envois du dossier
 * (`documentation/fournil/plan-historique-des-tirages.md`, lot H4).
 *
 * Même surface que le dossier du jour (`production_plan`, lecture) : qui
 * peut tirer le dossier peut lire son histoire. Des lectures seulement, et
 * le contrôleur n'injecte que le bus des requêtes.
 */
@Controller("admin/production")
@AdminSurface("production_plan")
export class ProductionPlanVersionsController {
  constructor(private readonly queries: QueryBus) {}

  /** Les versions, de la première à la dernière ; vide pour une journée jamais versionnée. */
  @Get("batch/:date/plan-versions")
  list(@Param("date", DAY) date: string): Promise<readonly PlanVersionView[]> {
    return this.queries.execute<ListPlanVersionsQuery, readonly PlanVersionView[]>(
      new ListPlanVersionsQuery(date),
    );
  }

  /**
   * Ce qui a changé de `from` à `to`. 400 sur une forme invalide ou un ordre
   * inversé, 404 sur une version que la journée n'a pas.
   */
  @Get("batch/:date/plan-versions/compare")
  compare(
    @Param("date", DAY) date: string,
    @Query(new ZodQuery(planVersionRangeQuerySchema)) range: PlanVersionRangeQuery,
  ): Promise<PlanVersionDiffView> {
    return this.queries.execute<ComparePlanVersionsQuery, PlanVersionDiffView>(
      new ComparePlanVersionsQuery(date, range.from, range.to),
    );
  }

  /** Les destinataires du dossier, et la dernière version que chacun a reçue de la journée. */
  @Get("batch/:date/plan-versions/dispatches")
  dispatches(@Param("date", DAY) date: string): Promise<readonly DossierDispatchView[]> {
    return this.queries.execute<ListDossierDispatchesQuery, readonly DossierDispatchView[]>(
      new ListDossierDispatchesQuery(date),
    );
  }
}

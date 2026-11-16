import {
  type ProductionGroupingPayload,
  productionGroupingPayloadSchema,
  type ProductionGroupingView,
  type UnplacedProductsOfDayQuery,
  unplacedProductsOfDayQuerySchema,
  type UnplacedProductsOfDayView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import {
  AdminSurface,
  RequireAnyPermission,
} from "../../../platform/auth/admin-surface.decorator.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { ZodBody, ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetProductionGroupingQuery } from "../application/queries/get-production-grouping.query.js";
import { GetUnplacedProductsOfDayQuery } from "../application/queries/get-unplaced-products-of-day.query.js";

/**
 * **Ce que les postes servent aux autres écrans du fournil** (plan
 * `fournil/plan-postes-du-fournil.md`, § 3.7 et § 3.10), sous l'URL des
 * postes mais sous les droits de ceux qui les lisent : le prévisionnel et le
 * récapitulatif (`production_plan:read`), les réassorts du fournil
 * (`production_resupply:read`). La page Postes, elle, reste sous
 * `production_workstations`. Il n'injecte que le bus des lectures.
 */
@Controller("admin/production/workstations")
@AdminSurface("production_workstations")
export class ProductionWorkstationReadingsController {
  constructor(private readonly queries: QueryBus) {}

  /**
   * Le rangement de ces SKU selon le mode du réglage. Un `POST` parce que la
   * liste ne tient pas dans une URL ; le garde déduirait `:write` du verbe,
   * d'où les droits de lecture posés à la main.
   */
  @Post("grouping")
  @HttpCode(HttpStatus.OK)
  @Idempotent("lecture : le `POST` porte les SKU à ranger, la requête n'écrit rien")
  @RequireAnyPermission("production_plan:read", "production_resupply:read")
  grouping(
    @Body(new ZodBody(productionGroupingPayloadSchema)) payload: ProductionGroupingPayload,
  ): Promise<ProductionGroupingView> {
    return this.queries.execute<GetProductionGroupingQuery, ProductionGroupingView>(
      new GetProductionGroupingQuery(payload.skus),
    );
  }

  /** L'alerte du Prod manager : les produits du jour sans poste. */
  @Get("unplaced")
  @RequireAnyPermission("production_plan:read")
  unplaced(
    @Query(new ZodQuery(unplacedProductsOfDayQuerySchema)) query: UnplacedProductsOfDayQuery,
  ): Promise<UnplacedProductsOfDayView> {
    return this.queries.execute<GetUnplacedProductsOfDayQuery, UnplacedProductsOfDayView>(
      new GetUnplacedProductsOfDayQuery(query.date),
    );
  }
}

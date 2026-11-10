import {
  productAudienceCountersQuerySchema,
  type ProductAudienceCounterView,
  type ProductAudienceCountersQuery,
} from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { ListProductAudienceCountersQuery } from "../application/queries/list-product-audience-counters.query.js";

/**
 * Lecture **staff** des compteurs d'audience, par SKU et par jour. Sous
 * `b2b_growth`, le droit des tableaux de croissance : c'est la même nature de
 * chiffres, et aucune ressource neuve n'est nécessaire pour lire.
 */
@Controller("admin/product-audience")
@AdminSurface("b2b_growth")
export class AdminProductAudienceController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  list(
    @Query(new ZodQuery(productAudienceCountersQuerySchema)) query: ProductAudienceCountersQuery,
  ): Promise<readonly ProductAudienceCounterView[]> {
    return this.queries.execute<
      ListProductAudienceCountersQuery,
      readonly ProductAudienceCounterView[]
    >(new ListProductAudienceCountersQuery(query.from, query.to));
  }
}

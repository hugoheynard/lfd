import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { CacheMetricsReport } from "@lfd/ops-contract";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { ReadCacheMetricsQuery } from "./read-cache-metrics.query.js";

/**
 * L'onglet Cache de la santé : les compteurs des objets partagés et les
 * mesures de l'instance. **Staff only**, lecture seule, sous le droit de la
 * page Santé.
 */
@Controller("admin/ops/caches")
@AdminSurface("ops_health")
export class AdminCachesController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  read(@Query("days") days?: string): Promise<CacheMetricsReport> {
    return this.queries.execute<ReadCacheMetricsQuery, CacheMetricsReport>(
      new ReadCacheMetricsQuery(days),
    );
  }
}

import { Controller, Get, UseGuards } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminAuthGuard } from "../../infra/auth/admin-auth.guard.js";
import { Public } from "../../infra/auth/public.decorator.js";
import { GetGrowthStatsQuery } from "../application/queries/get-growth-stats.query.js";
import { GetMarketAdoptionQuery } from "../application/queries/get-market-adoption.query.js";
import type { GrowthStatsView, MarketAdoptionView } from "@lfd/contracts";

/**
 * Surface **staff** du dashboard de croissance (`GET /admin/growth/stats`) : KPIs,
 * courbe d'acquisition, distribution de momentum, entonnoirs et cohortes — dérivés
 * du journal. Même montage à deux surfaces que les autres contrôleurs `/admin/*`.
 */
@Controller("admin/growth")
@Public()
@UseGuards(AdminAuthGuard)
export class AdminGrowthController {
  constructor(private readonly queries: QueryBus) {}

  @Get("stats")
  stats(): Promise<GrowthStatsView> {
    return this.queries.execute<GetGrowthStatsQuery, GrowthStatsView>(new GetGrowthStatsQuery());
  }

  @Get("adoption")
  adoption(): Promise<MarketAdoptionView> {
    return this.queries.execute<GetMarketAdoptionQuery, MarketAdoptionView>(
      new GetMarketAdoptionQuery(),
    );
  }
}

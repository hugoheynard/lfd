import { Controller, Get, UseGuards } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminAuthGuard } from "../../infra/auth/admin-auth.guard.js";
import { Public } from "../../infra/auth/public.decorator.js";
import { GetGrowthStatsQuery } from "../application/queries/get-growth-stats.query.js";
import { GetMarketAdoptionQuery } from "../application/queries/get-market-adoption.query.js";
import { GetMarketSectorsQuery } from "../application/queries/get-market-sectors.query.js";
import { GetMarketVolumeQuery } from "../application/queries/get-market-volume.query.js";
import { GetTerminationStatsQuery } from "../application/queries/get-termination-stats.query.js";
import type {
  GrowthStatsView,
  MarketAdoptionView,
  MarketSectorsView,
  MarketVolumeView,
  TerminationStatsView,
} from "@lfd/contracts";

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

  @Get("market-sectors")
  marketSectors(): Promise<MarketSectorsView> {
    return this.queries.execute<GetMarketSectorsQuery, MarketSectorsView>(
      new GetMarketSectorsQuery(),
    );
  }

  @Get("market-volume")
  marketVolume(): Promise<MarketVolumeView> {
    return this.queries.execute<GetMarketVolumeQuery, MarketVolumeView>(new GetMarketVolumeQuery());
  }

  @Get("terminations")
  terminations(): Promise<TerminationStatsView> {
    return this.queries.execute<GetTerminationStatsQuery, TerminationStatsView>(
      new GetTerminationStatsQuery(),
    );
  }
}

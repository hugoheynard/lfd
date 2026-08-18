import { AdminSurface } from "../../infra/auth/admin-surface.decorator.js";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { GetAcquisitionMetricsQuery } from "../application/queries/get-acquisition-metrics.query.js";
import { GetGrowthStatsQuery } from "../application/queries/get-growth-stats.query.js";
import { GetMarketAdoptionQuery } from "../application/queries/get-market-adoption.query.js";
import { GetMarketSectorsQuery } from "../application/queries/get-market-sectors.query.js";
import { GetMarketVolumeQuery } from "../application/queries/get-market-volume.query.js";
import { GetOrderMetricsQuery } from "../application/queries/get-order-metrics.query.js";
import { GetPortfolioMetricsQuery } from "../application/queries/get-portfolio-metrics.query.js";
import { GetSectorRevenueQuery } from "../application/queries/get-sector-revenue.query.js";
import { GetTerminationStatsQuery } from "../application/queries/get-termination-stats.query.js";
import type {
  AcquisitionMetricsView,
  GrowthStatsView,
  MarketAdoptionView,
  MarketSectorsView,
  MarketVolumeView,
  OrderMetricsView,
  PortfolioMetricsView,
  SectorRevenueView,
  TerminationStatsView,
} from "@lfd/contracts";

/**
 * Surface **staff** du dashboard de croissance (`GET /admin/growth/stats`) : KPIs,
 * courbe d'acquisition, distribution de momentum, entonnoirs et cohortes — dérivés
 * du journal. Même montage `@AdminSurface` que les autres contrôleurs `/admin/*`.
 */
@Controller("admin/growth")
@AdminSurface("growth")
export class AdminGrowthController {
  constructor(private readonly queries: QueryBus) {}

  /**
   * L'état du **portefeuille** — la barre de tête des Comptes clients. Servie
   * ici plutôt que par `account/` : elle lit les commandes, et le dossier client
   * n'a pas à en connaître l'existence.
   */
  @Get("portfolio")
  portfolio(): Promise<PortfolioMetricsView> {
    return this.queries.execute<GetPortfolioMetricsQuery, PortfolioMetricsView>(
      new GetPortfolioMetricsQuery(),
    );
  }

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

  @Get("sector-revenue")
  sectorRevenue(): Promise<SectorRevenueView> {
    return this.queries.execute<GetSectorRevenueQuery, SectorRevenueView>(
      new GetSectorRevenueQuery(),
    );
  }

  @Get("order-metrics")
  orderMetrics(): Promise<OrderMetricsView> {
    return this.queries.execute<GetOrderMetricsQuery, OrderMetricsView>(new GetOrderMetricsQuery());
  }

  @Get("acquisition-metrics")
  acquisitionMetrics(): Promise<AcquisitionMetricsView> {
    return this.queries.execute<GetAcquisitionMetricsQuery, AcquisitionMetricsView>(
      new GetAcquisitionMetricsQuery(),
    );
  }

  @Get("terminations")
  terminations(): Promise<TerminationStatsView> {
    return this.queries.execute<GetTerminationStatsQuery, TerminationStatsView>(
      new GetTerminationStatsQuery(),
    );
  }
}

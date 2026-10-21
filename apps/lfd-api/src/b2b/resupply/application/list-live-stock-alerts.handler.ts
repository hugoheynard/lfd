import type { LiveStockAlertsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ResupplySiteLabels } from "../domain/resupply-site-labels.js";
import { StockAlertReader } from "../domain/stock-alert.reader.js";
import { ListLiveStockAlertsQuery } from "./list-live-stock-alerts.query.js";
import { stockAlertView } from "./stock-alert-view.js";

/**
 * Sert l'en-tête de « Réassorts à produire » : les alertes vivantes, groupées
 * par point dans l'ordre de leur alerte la plus récente.
 */
@QueryHandler(ListLiveStockAlertsQuery)
export class ListLiveStockAlertsHandler implements IQueryHandler<
  ListLiveStockAlertsQuery,
  LiveStockAlertsView
> {
  constructor(
    private readonly reader: StockAlertReader,
    private readonly sites: ResupplySiteLabels,
  ) {}

  async execute(): Promise<LiveStockAlertsView> {
    const alerts = await this.reader.liveEverywhere();
    const siteIds = [...new Set(alerts.map((alert) => alert.siteId))];
    const labels = await this.sites.labelsOf(siteIds);
    return {
      sites: siteIds.map((siteId) => ({
        siteId,
        siteLabel: labels.get(siteId) ?? null,
        alerts: alerts.filter((alert) => alert.siteId === siteId).map(stockAlertView),
      })),
    };
  }
}

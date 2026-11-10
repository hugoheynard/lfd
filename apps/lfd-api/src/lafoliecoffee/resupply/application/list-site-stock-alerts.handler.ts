import type { SiteStockAlertsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { StockAlertReader } from "../domain/stock-alert.reader.js";
import { ListSiteStockAlertsQuery } from "./list-site-stock-alerts.query.js";
import { stockAlertView } from "./stock-alert-view.js";

/** Sert la page Réassort du comptoir : les alertes vivantes du point, sans échéance. */
@QueryHandler(ListSiteStockAlertsQuery)
export class ListSiteStockAlertsHandler implements IQueryHandler<
  ListSiteStockAlertsQuery,
  SiteStockAlertsView
> {
  constructor(private readonly reader: StockAlertReader) {}

  async execute(query: ListSiteStockAlertsQuery): Promise<SiteStockAlertsView> {
    const alerts = await this.reader.liveForSite(query.siteId);
    return { siteId: query.siteId, alerts: alerts.map(stockAlertView) };
  }
}

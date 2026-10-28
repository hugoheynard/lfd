import type { LiveStockAlertsView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { ListLiveStockAlertsQuery } from "../application/list-live-stock-alerts.query.js";

/**
 * **Les alertes de stock vivantes de tous les points** — l'en-tête de
 * « Réassorts à produire » (lot R1b). Sous le même droit que
 * `admin/site-resupplies/to-produce` : les réassorts (`production_resupply:read`).
 */
@Controller("admin/site-stock-alerts/live")
@AdminSurface("production_resupply")
export class AdminLiveStockAlertsController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  @RequirePermission("production_resupply:read")
  list(): Promise<LiveStockAlertsView> {
    return this.queries.execute<ListLiveStockAlertsQuery, LiveStockAlertsView>(
      new ListLiveStockAlertsQuery(),
    );
  }
}

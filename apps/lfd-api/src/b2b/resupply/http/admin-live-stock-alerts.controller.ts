import type { LiveStockAlertsView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import {
  AdminSurface,
  RequireAnyPermission,
} from "../../../platform/auth/admin-surface.decorator.js";
import { ListLiveStockAlertsQuery } from "../application/list-live-stock-alerts.query.js";

/**
 * **Les alertes de stock vivantes de tous les points** — l'en-tête de
 * « Réassorts à produire » (lot R1b). Sous les mêmes droits que
 * `admin/site-resupplies/to-produce` : la fournée ou le prévisionnel.
 */
@Controller("admin/site-stock-alerts/live")
@AdminSurface("production_worksheet")
export class AdminLiveStockAlertsController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  @RequireAnyPermission("production_worksheet:read", "production_plan:read")
  list(): Promise<LiveStockAlertsView> {
    return this.queries.execute<ListLiveStockAlertsQuery, LiveStockAlertsView>(
      new ListLiveStockAlertsQuery(),
    );
  }
}

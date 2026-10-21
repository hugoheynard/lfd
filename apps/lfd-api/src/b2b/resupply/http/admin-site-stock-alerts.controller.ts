import {
  type DeclareStockAlertPayload,
  declareStockAlertSchema,
  type SiteStockAlertsView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { DeclareStockAlertCommand } from "../application/declare-stock-alert.command.js";
import { LiftStockAlertCommand } from "../application/lift-stock-alert.command.js";
import { ListSiteStockAlertsQuery } from "../application/list-site-stock-alerts.query.js";

/**
 * **Rupture et stock faible** — Comptoir › Réassort, pour le point du
 * bandeau (lot R1b, `reassort-boutiques/plan-reapprovisionnement.md`,
 * 2026-10-21). Sous `handover_counter`, comme la commande et la réception du
 * réassort. Le point est dans l'URL et dans chaque `where`.
 */
@Controller("admin/site-stock-alerts/sites")
@AdminSurface("handover_counter")
export class AdminSiteStockAlertsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get(":siteId")
  @RequirePermission("handover_counter:read")
  list(@Param("siteId") siteId: string): Promise<SiteStockAlertsView> {
    return this.queries.execute<ListSiteStockAlertsQuery, SiteStockAlertsView>(
      new ListSiteStockAlertsQuery(siteId),
    );
  }

  @Post(":siteId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("handover_counter:write")
  async declare(
    @Param("siteId") siteId: string,
    @Body(new ZodBody(declareStockAlertSchema)) body: DeclareStockAlertPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<DeclareStockAlertCommand, void>(
      new DeclareStockAlertCommand(siteId, body.sku, body.level, staffUserId),
    );
  }

  @Post(":siteId/:alertId/lift")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("handover_counter:write")
  async lift(
    @Param("siteId") siteId: string,
    @Param("alertId") alertId: string,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<LiftStockAlertCommand, void>(
      new LiftStockAlertCommand(siteId, alertId, staffUserId),
    );
  }
}

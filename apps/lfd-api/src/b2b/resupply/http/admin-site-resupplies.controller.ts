import {
  type PlacedSiteResupplyResponse,
  type PlaceSiteResupplyPayload,
  placeSiteResupplySchema,
  type SiteResuppliesView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { CancelSiteResupplyCommand } from "../application/cancel-site-resupply.command.js";
import { ListSiteResuppliesQuery } from "../application/list-site-resupplies.query.js";
import { PlaceSiteResupplyCommand } from "../application/place-site-resupply.command.js";

/**
 * **Commander un réassort** — Comptoir › Réassort, pour le point du bandeau
 * (lot R1, `reassort-boutiques/plan-reapprovisionnement.md` §12, 2026-10-21).
 *
 * Sous `handover_counter`, comme la réception : le comptoir du point
 * commande (Hugo : « le comptoir ; on verra la granularité du droit plus
 * tard »). Le point est dans l'URL et dans chaque `where`.
 */
@Controller("admin/site-resupplies/sites")
@AdminSurface("handover_counter")
export class AdminSiteResuppliesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get(":siteId")
  @RequirePermission("handover_counter:read")
  list(@Param("siteId") siteId: string): Promise<SiteResuppliesView> {
    return this.queries.execute<ListSiteResuppliesQuery, SiteResuppliesView>(
      new ListSiteResuppliesQuery(siteId),
    );
  }

  @Post(":siteId")
  @RequirePermission("handover_counter:write")
  async place(
    @Param("siteId") siteId: string,
    @Body(new ZodBody(placeSiteResupplySchema)) body: PlaceSiteResupplyPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<PlacedSiteResupplyResponse> {
    const id = await this.commands.execute<PlaceSiteResupplyCommand, string>(
      new PlaceSiteResupplyCommand(siteId, body.target, body.lines, staffUserId),
    );
    return { id };
  }

  @Post(":siteId/:resupplyId/cancel")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("handover_counter:write")
  async cancel(
    @Param("siteId") siteId: string,
    @Param("resupplyId") resupplyId: string,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<CancelSiteResupplyCommand, void>(
      new CancelSiteResupplyCommand(siteId, resupplyId, staffUserId),
    );
  }
}

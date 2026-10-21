import {
  type ResuppliesToProduceView,
  type ResupplyProductionDayView,
  resupplyServiceDaySchema,
} from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import {
  AdminSurface,
  RequireAnyPermission,
} from "../../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetResupplyProductionDayQuery } from "../application/get-resupply-production-day.query.js";
import { ListResuppliesToProduceQuery } from "../application/list-resupplies-to-produce.query.js";

/**
 * **Réassorts à produire** — l'écran du fournil, EN LECTURE (lot R1, §12).
 *
 * Servi par le commerce, qui possède le réassort, et lu par l'écran du
 * fournil côté navigateur : aucun bloc serveur ne traverse
 * (`production → b2b` reste interdit). Le canal du fournil viendra en R3,
 * quand le réassort entrera au plan figé. Sous les droits du fournil : la
 * fournée (`production_worksheet`) ou le prévisionnel (`production_plan`).
 */
@Controller("admin/site-resupplies/to-produce")
@AdminSurface("production_worksheet")
export class AdminResuppliesToProduceController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  @RequireAnyPermission("production_worksheet:read", "production_plan:read")
  list(): Promise<ResuppliesToProduceView> {
    return this.queries.execute<ListResuppliesToProduceQuery, ResuppliesToProduceView>(
      new ListResuppliesToProduceQuery(),
    );
  }

  /**
   * Une journée, réassorts figés compris : l'onglet « Réassorts » de Prod
   * manager (lot R3d, 2026-10-21). Sous les mêmes droits.
   */
  @Get(":day")
  @RequireAnyPermission("production_worksheet:read", "production_plan:read")
  day(
    @Param("day", new ZodQuery(resupplyServiceDaySchema)) day: string,
  ): Promise<ResupplyProductionDayView> {
    return this.queries.execute<GetResupplyProductionDayQuery, ResupplyProductionDayView>(
      new GetResupplyProductionDayQuery(day),
    );
  }
}

import type { ResuppliesToProduceView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import {
  AdminSurface,
  RequireAnyPermission,
} from "../../../platform/auth/admin-surface.decorator.js";
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
}

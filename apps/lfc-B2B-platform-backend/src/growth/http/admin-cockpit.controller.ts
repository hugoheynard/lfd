import { AdminSurface } from "../../infra/auth/admin-surface.decorator.js";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { GetCockpitQuery } from "../application/queries/get-cockpit.query.js";
import type { LeadScoreView } from "@lfd/contracts";

/**
 * Surface **staff** du cockpit : la queue « 5 meilleurs coups du jour », lue du
 * read-model matérialisé `lead_score`. Même montage `@AdminSurface` que les autres
 * Surface staff murée par `@AdminSurface` : identité vérifiée, puis périmètre.
 */
@Controller("admin/cockpit")
@AdminSurface("growth")
export class AdminCockpitController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  list(): Promise<LeadScoreView[]> {
    return this.queries.execute<GetCockpitQuery, LeadScoreView[]>(new GetCockpitQuery());
  }
}

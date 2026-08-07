import { Controller, Get, UseGuards } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminAuthGuard } from "../../infra/auth/admin-auth.guard.js";
import { Public } from "../../infra/auth/public.decorator.js";
import { GetCockpitQuery } from "../application/queries/get-cockpit.query.js";
import type { LeadScoreView } from "@lfd/contracts";

/**
 * Surface **staff** du cockpit : la queue « 5 meilleurs coups du jour », lue du
 * read-model matérialisé `lead_score`. Même montage à deux surfaces que les autres
 * contrôleurs `/admin/*` (`@Public()` désarme le guard client global,
 * `AdminAuthGuard` réarme la porte staff). Afficher la queue journalise `reco.shown`.
 */
@Controller("admin/cockpit")
@Public()
@UseGuards(AdminAuthGuard)
export class AdminCockpitController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  list(): Promise<LeadScoreView[]> {
    return this.queries.execute<GetCockpitQuery, LeadScoreView[]>(new GetCockpitQuery());
  }
}

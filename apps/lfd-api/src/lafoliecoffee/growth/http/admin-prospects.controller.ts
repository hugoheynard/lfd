import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { ListProspectsQuery } from "../application/queries/list-prospects.query.js";
import type { ProspectView } from "@lfd/contracts";

/**
 * Surface **staff** du module croissance : la file des **prospects** — les
 * établissements démarchés qui ne sont pas encore clients — pour l'onglet
 * commercial.
 *
 * Surface staff murée par `@AdminSurface` : identité vérifiée, puis périmètre.
 */
@Controller("admin/prospects")
@AdminSurface("b2b_growth")
export class AdminProspectsController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  list(): Promise<ProspectView[]> {
    return this.queries.execute<ListProspectsQuery, ProspectView[]>(new ListProspectsQuery());
  }
}

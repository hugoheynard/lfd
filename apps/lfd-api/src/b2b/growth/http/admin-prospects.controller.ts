import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { ListProspectsQuery } from "../application/queries/list-prospects.query.js";
import type { ProspectView } from "@lfd/contracts";

/**
 * Surface **staff** du module croissance : la liste des **prospects** (hot/mid),
 * dérivée du journal, pour l'onglet commercial.
 *
 * Surface staff murée par `@AdminSurface` : identité vérifiée, puis périmètre.
 */
@Controller("admin/prospects")
@AdminSurface("growth")
export class AdminProspectsController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  list(): Promise<ProspectView[]> {
    return this.queries.execute<ListProspectsQuery, ProspectView[]>(new ListProspectsQuery());
  }
}

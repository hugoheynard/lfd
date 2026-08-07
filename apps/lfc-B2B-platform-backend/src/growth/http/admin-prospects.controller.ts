import { Controller, Get, UseGuards } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminAuthGuard } from "../../infra/auth/admin-auth.guard.js";
import { Public } from "../../infra/auth/public.decorator.js";
import { ListProspectsQuery } from "../application/queries/list-prospects.query.js";
import type { ProspectView } from "../domain/prospect.js";

/**
 * Surface **staff** du module croissance : la liste des **prospects** (hot/mid),
 * dérivée du journal, pour l'onglet commercial.
 *
 * Même montage à deux surfaces que les autres contrôleurs `/admin/*` : `@Public()`
 * désarme le guard client global, `@UseGuards(AdminAuthGuard)` réarme la porte
 * staff (audience dédiée, ou bypass de dev).
 */
@Controller("admin/prospects")
@Public()
@UseGuards(AdminAuthGuard)
export class AdminProspectsController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  list(): Promise<ProspectView[]> {
    return this.queries.execute<ListProspectsQuery, ProspectView[]>(new ListProspectsQuery());
  }
}

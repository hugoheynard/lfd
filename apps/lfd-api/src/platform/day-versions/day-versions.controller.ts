import {
  type DayVersionsQuery,
  dayVersionsQuerySchema,
  type DayVersionsView,
  type StaffPermission,
} from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSelfSurface } from "../auth/admin-surface.decorator.js";
import { StaffPermissions } from "../auth/staff.decorator.js";
import { ZodQuery } from "../shared/http/zod-body.pipe.js";
import { GetDayVersionsQuery } from "./get-day-versions.query.js";

/**
 * **La porte unique des versions de journée**
 * (`documentation/caching-usage/version-par-journee.md`, D8 — Hugo,
 * 2026-11-03 : « c'est important pour ne pas dériver »).
 *
 * `GET admin/day-versions?date=AAAA-MM-JJ&journals=orders,production` →
 * `{ date, versions: { orders, production } }`. Elle remplace les six routes
 * qu'avait chaque journal, chacune sous son droit.
 *
 * Surface RÉFLEXIVE (`@AdminSelfSurface`) : la porte elle-même n'exige qu'une
 * fiche staff résolue, parce que le droit dépend du journal et se tranche dans
 * le handler, source par source. Un journal non permis est absent ; un
 * journal inconnu est un 400 qui le nomme (contrat `dayVersionsQuerySchema`).
 */
@Controller("admin/day-versions")
@AdminSelfSurface()
export class DayVersionsController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  versions(
    @Query(new ZodQuery(dayVersionsQuerySchema)) query: DayVersionsQuery,
    @StaffPermissions() permissions: readonly StaffPermission[],
  ): Promise<DayVersionsView> {
    return this.queries.execute<GetDayVersionsQuery, DayVersionsView>(
      new GetDayVersionsQuery(query.date, query.journals, permissions),
    );
  }
}

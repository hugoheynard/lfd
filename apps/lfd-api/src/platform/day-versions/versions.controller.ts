import {
  type StaffPermission,
  type VersionsQuery,
  versionsQuerySchema,
  type VersionsView,
} from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSelfSurface } from "../auth/admin-surface.decorator.js";
import { StaffPermissions } from "../auth/staff.decorator.js";
import { ZodQuery } from "../shared/http/zod-body.pipe.js";
import { GetVersionsQuery } from "./get-versions.query.js";

/**
 * **La porte des versions** (`documentation/caching-usage/plan-veilleur-unique.md`,
 * § 3.3) : `GET admin/versions?date=AAAA-MM-JJ&subjects=orders,companies` →
 * `{ date, versions: { orders, companies } }`. `date` n'est exigée que si un
 * sujet journalier est demandé.
 *
 * Surface RÉFLEXIVE (`@AdminSelfSurface`) : la porte n'exige qu'une fiche
 * staff résolue, parce que le droit dépend du sujet et se tranche dans le
 * handler. Un sujet non permis est absent ; un sujet inconnu est un 400 qui
 * le nomme (contrat `versionsQuerySchema`).
 */
@Controller("admin/versions")
@AdminSelfSurface()
export class VersionsController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  versions(
    @Query(new ZodQuery(versionsQuerySchema)) query: VersionsQuery,
    @StaffPermissions() permissions: readonly StaffPermission[],
  ): Promise<VersionsView> {
    return this.queries.execute<GetVersionsQuery, VersionsView>(
      new GetVersionsQuery(query.date ?? null, query.subjects, permissions),
    );
  }
}

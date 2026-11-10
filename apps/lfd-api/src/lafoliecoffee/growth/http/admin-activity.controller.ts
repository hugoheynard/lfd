import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { activityQuerySchema, type ActivityPageView, type ActivityQuery } from "@lfd/contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { ReadActivityJournalQuery } from "../application/queries/read-activity-journal.query.js";

/**
 * Le **journal d'activité**, en lecture — qui a fait quoi, tous modules
 * confondus, filtrable et paginé par curseur.
 *
 * Une ressource `activity` à lui, et pas `staff` : le journal traverse les
 * modules, donc le ranger sous l'un d'eux donnerait à son audience l'activité
 * des autres par la bande. En lecture seule, parce qu'il n'y a rien à écrire —
 * la table est append-only, alimentée par les handlers.
 */
@Controller("admin/activity")
@AdminSurface("activity")
export class AdminActivityController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  read(
    @Query(new ZodQuery(activityQuerySchema)) filters: ActivityQuery,
  ): Promise<ActivityPageView> {
    return this.queries.execute<ReadActivityJournalQuery, ActivityPageView>(
      new ReadActivityJournalQuery(filters),
    );
  }
}

import {
  type DaySupervisionQuery,
  daySupervisionQuerySchema,
  type DaySupervisionView,
} from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetDaySupervisionQuery } from "../application/queries/get-day-supervision.query.js";

/**
 * La **Supervision du jour** — une vue en lecture seule, à part des postes de
 * terrain (`documentation/order/plan-supervision-du-jour.md`).
 *
 * Sa propre ressource, `b2b_supervision`, et non `b2b_orders` : elle ouvre le
 * nom des clients du jour, sans lignes ni montants, à qui n'a pas forcément
 * le droit de lire les commandes.
 */
@Controller("admin/supervision")
@AdminSurface("b2b_supervision")
export class AdminSupervisionController {
  constructor(private readonly queries: QueryBus) {}

  /** Une date de SERVICE (retrait ou livraison), pas de commande. */
  @Get("day")
  day(
    @Query(new ZodQuery(daySupervisionQuerySchema)) query: DaySupervisionQuery,
  ): Promise<DaySupervisionView> {
    return this.queries.execute<GetDaySupervisionQuery, DaySupervisionView>(
      new GetDaySupervisionQuery(query.date),
    );
  }
}

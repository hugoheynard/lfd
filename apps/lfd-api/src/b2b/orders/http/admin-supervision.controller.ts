import {
  type DaySupervisionQuery,
  daySupervisionQuerySchema,
  type DaySupervisionView,
  type DayVersionQuery,
  dayVersionQuerySchema,
  type DayVersionView,
} from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetDaySupervisionQuery } from "../application/queries/get-day-supervision.query.js";
import { GetOrderDayVersionQuery } from "../application/queries/get-order-day-version.query.js";

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

  /**
   * Une date de SERVICE (retrait ou livraison), pas de commande. Absente, le
   * jour courant du serveur à Paris : l'écran n'a pas à choisir sa journée.
   */
  @Get("day")
  day(
    @Query(new ZodQuery(daySupervisionQuerySchema)) query: DaySupervisionQuery,
  ): Promise<DaySupervisionView> {
    return this.queries.execute<GetDaySupervisionQuery, DaySupervisionView>(
      new GetDaySupervisionQuery(query.date),
    );
  }

  /**
   * **La version du jour dans le journal du commerce**
   * (`documentation/caching-usage/plan-version-par-journee.md`, V2) : l'écran
   * ne relit `day` que si elle a changé. La date est OBLIGATOIRE — l'écran la
   * tient de la réponse de `day`, qui la rend toujours.
   */
  @Get("version")
  version(
    @Query(new ZodQuery(dayVersionQuerySchema)) query: DayVersionQuery,
  ): Promise<DayVersionView> {
    return this.queries.execute<GetOrderDayVersionQuery, DayVersionView>(
      new GetOrderDayVersionQuery(query.date),
    );
  }
}

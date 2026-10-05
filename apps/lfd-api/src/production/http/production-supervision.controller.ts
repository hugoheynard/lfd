import {
  type DayVersionQuery,
  type DayVersionView,
  dayVersionQuerySchema,
  type ProductionWorksheetQuery,
  type ProductionWorksheetView,
  productionWorksheetQuerySchema,
} from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { GetProductionDayVersionQuery } from "../application/queries/get-production-day-version.query.js";
import { GetProductionWorksheetQuery } from "../application/queries/get-production-worksheet.query.js";

/**
 * **Le fournil vu depuis la Supervision** — aucun geste
 * (`documentation/order/plan-supervision-du-jour.md`, §3).
 *
 * Une seconde PORTE sur les lectures du fournil, pas une seconde lecture :
 * chaque route envoie exactement la query que `ProductionWorksheetController`
 * envoie, avec les mêmes paramètres. La colonne colisage ne passe plus par ici :
 * elle lit le board du colisage (`GET admin/packing/:date/board`, plan du
 * colisage §17.6). Ce qui
 * change est le droit — `b2b_supervision`, qui se donne sans ouvrir la
 * Production en écriture comme le ferait `b2b_orders`.
 *
 * Il n'injecte que le `QueryBus` : une vue ne commande rien.
 */
@Controller("admin/supervision")
@AdminSurface("b2b_supervision")
export class ProductionSupervisionController {
  constructor(private readonly queries: QueryBus) {}

  /** La colonne 1 — la fiche d'atelier du jour, comme `GET admin/production/worksheet`. */
  @Get("preparation")
  preparation(
    @Query(new ZodQuery(productionWorksheetQuerySchema)) query: ProductionWorksheetQuery,
  ): Promise<ProductionWorksheetView> {
    return this.queries.execute<GetProductionWorksheetQuery, ProductionWorksheetView>(
      new GetProductionWorksheetQuery(query.date),
    );
  }

  /**
   * La version du journal du fournil, comme `GET admin/production/version` —
   * la même query, sous `b2b_supervision` (`plan-version-par-journee.md`, D3/D4).
   */
  @Get("production-version")
  productionVersion(
    @Query(new ZodQuery(dayVersionQuerySchema)) query: DayVersionQuery,
  ): Promise<DayVersionView> {
    return this.queries.execute<GetProductionDayVersionQuery, DayVersionView>(
      new GetProductionDayVersionQuery(query.date),
    );
  }
}

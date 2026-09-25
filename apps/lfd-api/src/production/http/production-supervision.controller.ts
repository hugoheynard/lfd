import {
  type ProductionPackingQuery,
  type ProductionPackingView,
  type ProductionWorksheetQuery,
  type ProductionWorksheetView,
  productionPackingQuerySchema,
  productionWorksheetQuerySchema,
} from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { GetProductionPackingQuery } from "../application/queries/get-production-packing.query.js";
import { GetProductionWorksheetQuery } from "../application/queries/get-production-worksheet.query.js";

/**
 * **Le fournil vu depuis la Supervision** — deux colonnes, aucun geste
 * (`documentation/order/plan-supervision-du-jour.md`, §3).
 *
 * Une seconde PORTE sur les lectures du poste, pas une seconde lecture : chaque
 * route envoie exactement la query que `ProductionWorksheetController` et
 * `ProductionPackingController` envoient, avec les mêmes paramètres. Ce qui
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

  /** La colonne 2 — le poste de colisage, comme `GET admin/production/packing`. */
  @Get("packing")
  packing(
    @Query(new ZodQuery(productionPackingQuerySchema)) query: ProductionPackingQuery,
  ): Promise<ProductionPackingView> {
    return this.queries.execute<GetProductionPackingQuery, ProductionPackingView>(
      new GetProductionPackingQuery(query.date),
    );
  }
}

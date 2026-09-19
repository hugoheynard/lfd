import { Controller, Get, Param, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import {
  productHistoryQuerySchema,
  type ProductHistoryPageView,
  type ProductHistoryQuery,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../../../platform/shared/http/zod-body.pipe.js";
import { GetProductHistoryQuery } from "../application/get-product-history.js";

/**
 * **L'onglet « Historique » d'une fiche produit.**
 *
 * Sous les droits de la fiche elle-même (`pim_catalog`, en lecture) : qui lit
 * une fiche lit ce qui l'a touchée. Le journal d'activité entier, lui, reste
 * sous `activity:read` — cette route n'en rend que les fils du référentiel qui
 * mènent à cette fiche.
 *
 * Sous le chemin de la fiche (`/pim/catalogue/products/:id/history`), dans un
 * contrôleur à part : celui des fiches écrit, celui-ci ne fait que relire le
 * journal.
 */
@AdminSurface("pim_catalog")
@Controller("catalogue/products")
export class ProductHistoryController {
  constructor(private readonly queries: QueryBus) {}

  /** Une page de l'historique, dans un instantané ancré par `asOf`. */
  @Get(":id/history")
  history(
    @Param("id") id: string,
    @Query(new ZodQuery(productHistoryQuerySchema)) query: ProductHistoryQuery,
  ): Promise<ProductHistoryPageView> {
    return this.queries.execute<GetProductHistoryQuery, ProductHistoryPageView>(
      new GetProductHistoryQuery(id, query.page, query.pageSize, query.asOf ?? null),
    );
  }
}

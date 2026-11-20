import {
  shopTillOrdersReportQuerySchema,
  type ShopTillOrdersReportQuery,
  type ShopTillOrdersReportView,
} from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetShopTillOrdersReportQuery } from "../application/queries/get-shop-till-orders-report.query.js";

/**
 * **Les commandes notées au comptoir, à régler en boutique** —
 * `GET /admin/growth/shop-till-orders?from=&to=`
 * (`commande-particulier-reglee-en-boutique.md`, § 4.2).
 *
 * Sous `b2b_growth`, le droit des autres rapports de la croissance : des
 * chiffres lus pour comprendre. Aucune ressource neuve.
 */
@Controller("admin/growth/shop-till-orders")
@AdminSurface("b2b_growth")
export class AdminShopTillOrdersController {
  constructor(private readonly queries: QueryBus) {}

  /** Le montant commandé et la part remise, par jour de retrait et par point. */
  @Get()
  report(
    @Query(new ZodQuery(shopTillOrdersReportQuerySchema)) query: ShopTillOrdersReportQuery,
  ): Promise<ShopTillOrdersReportView> {
    return this.queries.execute<GetShopTillOrdersReportQuery, ShopTillOrdersReportView>(
      new GetShopTillOrdersReportQuery(query.from, query.to),
    );
  }
}

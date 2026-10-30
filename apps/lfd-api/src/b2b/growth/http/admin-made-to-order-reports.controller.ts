import {
  DEFAULT_MADE_TO_ORDER_MONTH_WINDOW,
  madeToOrderByClientQuerySchema,
  madeToOrderMonthlyQuerySchema,
  type MadeToOrderByClientQuery,
  type MadeToOrderByClientView,
  type MadeToOrderMonthlyQuery,
  type MadeToOrderMonthlyView,
} from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetMadeToOrderByClientQuery } from "../application/queries/get-made-to-order-by-client.query.js";
import { GetMadeToOrderMonthlyQuery } from "../application/queries/get-made-to-order-monthly.query.js";

/**
 * **Les rapports du sur mesure** — `GET /admin/growth/made-to-order/*`
 * (lot R, `documentation/catalogue/plan-sur-mesure-partout.md` § 5 ter).
 *
 * Sous `b2b_growth`, le droit de la croissance et des audiences : des
 * chiffres de vente lus pour comprendre. Aucune ressource neuve.
 */
@Controller("admin/growth/made-to-order")
@AdminSurface("b2b_growth")
export class AdminMadeToOrderReportsController {
  constructor(private readonly queries: QueryBus) {}

  /** Le sur mesure par mois : 6, 12 (par défaut) ou 24 mois glissants. */
  @Get("monthly")
  monthly(
    @Query(new ZodQuery(madeToOrderMonthlyQuerySchema)) query: MadeToOrderMonthlyQuery,
  ): Promise<MadeToOrderMonthlyView> {
    return this.queries.execute<GetMadeToOrderMonthlyQuery, MadeToOrderMonthlyView>(
      new GetMadeToOrderMonthlyQuery(query.months ?? DEFAULT_MADE_TO_ORDER_MONTH_WINDOW),
    );
  }

  /** Le sur mesure par client et par article, du jour `from` au jour `to`. */
  @Get("clients")
  byClient(
    @Query(new ZodQuery(madeToOrderByClientQuerySchema)) query: MadeToOrderByClientQuery,
  ): Promise<MadeToOrderByClientView> {
    return this.queries.execute<GetMadeToOrderByClientQuery, MadeToOrderByClientView>(
      new GetMadeToOrderByClientQuery(query.from, query.to),
    );
  }
}

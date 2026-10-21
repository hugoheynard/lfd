import { type DayStockOverviewView, resupplyServiceDaySchema } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetDayStockOverviewQuery } from "../application/get-day-stock-overview.query.js";

/**
 * **L'onglet Stock de la Supervision** (lot S1,
 * `reassort-boutiques/plan-reapprovisionnement.md`, 2026-10-22) — une
 * journée, tous points. Sous `b2b_supervision`, le droit de la page
 * `/supervision` : qui la regarde voit aussi son onglet. Lecture seule.
 */
@Controller("admin/supervision/stock")
@AdminSurface("b2b_supervision")
export class AdminSupervisionStockController {
  constructor(private readonly queries: QueryBus) {}

  /** Une date de SERVICE, obligatoire : l'écran la tient de sa journée. */
  @Get(":day")
  day(
    @Param("day", new ZodQuery(resupplyServiceDaySchema)) day: string,
  ): Promise<DayStockOverviewView> {
    return this.queries.execute<GetDayStockOverviewQuery, DayStockOverviewView>(
      new GetDayStockOverviewQuery(day),
    );
  }
}

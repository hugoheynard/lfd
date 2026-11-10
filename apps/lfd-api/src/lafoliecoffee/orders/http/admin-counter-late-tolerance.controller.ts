import type { CounterLateToleranceView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { GetCounterLateToleranceQuery } from "../application/queries/get-counter-late-tolerance.query.js";

/**
 * **La tolérance de retard, lue au comptoir** (Hugo, 2026-11-03). Le comptoir
 * juge « créneau dépassé » avec la même tolérance que la Supervision ; il n'a
 * que `handover_counter`, et la route du réglage (`b2b_orders`) ne lui est pas
 * ouverte — d'où cette route, qui n'en sert qu'une valeur.
 */
@Controller("admin/counter/late-tolerance")
@AdminSurface("handover_counter")
export class AdminCounterLateToleranceController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  async lateTolerance(): Promise<CounterLateToleranceView> {
    return this.queries.execute<GetCounterLateToleranceQuery, CounterLateToleranceView>(
      new GetCounterLateToleranceQuery(),
    );
  }
}

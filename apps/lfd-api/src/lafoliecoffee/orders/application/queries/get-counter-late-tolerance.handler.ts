import type { CounterLateToleranceView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { LateToleranceReader } from "../../domain/ports/late-tolerance.reader.js";
import { GetCounterLateToleranceQuery } from "./get-counter-late-tolerance.query.js";

/**
 * La tolérance de retard servie au comptoir, qui juge « créneau dépassé »
 * avec la même tolérance que la Supervision (Hugo, 2026-11-03). Une seule
 * valeur sort : le reste du réglage n'est pas l'affaire du poste.
 */
@QueryHandler(GetCounterLateToleranceQuery)
export class GetCounterLateToleranceHandler implements IQueryHandler<
  GetCounterLateToleranceQuery,
  CounterLateToleranceView
> {
  constructor(private readonly tolerance: LateToleranceReader) {}

  async execute(): Promise<CounterLateToleranceView> {
    return { lateToleranceMinutes: await this.tolerance.lateToleranceMinutes() };
  }
}

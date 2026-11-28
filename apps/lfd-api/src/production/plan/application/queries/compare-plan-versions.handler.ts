import type { PlanVersionDiffView, PlanVersionMarkView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { PlanVersionComparison, ServiceDay } from "../../../day/index.js";
import { ComparePlanVersionsQuery } from "./compare-plan-versions.query.js";

type PlanVersionMark = Awaited<ReturnType<PlanVersionComparison["compare"]>>["from"];

/**
 * **Comparer deux versions du plan d'une journée**
 * (`documentation/fournil/les-versions-du-plan.md`) : le diff du noyau tel quel, ses instants en ISO. L'ordre inversé
 * (400) et la version inconnue (404) sont jugés par le diff lui-même.
 */
@QueryHandler(ComparePlanVersionsQuery)
export class ComparePlanVersionsHandler implements IQueryHandler<
  ComparePlanVersionsQuery,
  PlanVersionDiffView
> {
  constructor(private readonly comparison: PlanVersionComparison) {}

  async execute(query: ComparePlanVersionsQuery): Promise<PlanVersionDiffView> {
    const diff = await this.comparison.compare(
      ServiceDay.of(query.serviceDay),
      query.from,
      query.to,
    );
    return {
      from: markView(diff.from),
      to: markView(diff.to),
      baselineUnknown: diff.baselineUnknown,
      production: diff.production,
      changes: diff.changes.map((change) => ({ ...change, by: markView(change.by) })),
      resupplies: diff.resupplies.map((change) => ({ ...change, by: markView(change.by) })),
      toCheck: diff.toCheck.map((exit) => ({ ...exit, by: markView(exit.by) })),
    };
  }
}

function markView(mark: PlanVersionMark): PlanVersionMarkView {
  return {
    ...mark,
    recordedAt: mark.recordedAt.toISOString(),
    closedAt: mark.closedAt.toISOString(),
  };
}

import type { ProductionProblemView, ProductionProblemsView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { ProductionDayRepository, ServiceDay } from "../../../day/index.js";
import type { ProductionDay } from "../../../day/index.js";
import type { ProductionProblemState } from "../../domain/entities/production-problem.js";
import { OpenProductionProblemsReader } from "../../domain/ports/production-problem.ports.js";
import { UnconfirmedLinesReading } from "../services/unconfirmed-lines-reading.service.js";
import { ListOpenProductionProblemsQuery } from "./list-open-production-problems.query.js";

/**
 * **Les problèmes ouverts du jour** (plan
 * `documentation/fournil/plan-niveaux-de-suivi.md`, § 3.8) : en rouge dans la
 * Supervision jusqu'à « Marquer traité ».
 *
 * Le nom et le sorti de chaque ligne se lisent sur la journée, part corrigée
 * déduite : un sorti resté au-dessus du plafond dit au responsable ce que le
 * rouge n'a pas pu corriger. Les plus anciens d'abord.
 *
 * À côté, les lignes « à confirmer » (§ 3.7) : en toujours vert sans palier
 * à heure, la fournée automatique ne les complète pas.
 */
@QueryHandler(ListOpenProductionProblemsQuery)
export class ListOpenProductionProblemsHandler implements IQueryHandler<
  ListOpenProductionProblemsQuery,
  ProductionProblemsView
> {
  constructor(
    private readonly reader: OpenProductionProblemsReader,
    private readonly days: ProductionDayRepository,
    private readonly unconfirmed: UnconfirmedLinesReading,
  ) {}

  async execute(query: ListOpenProductionProblemsQuery): Promise<ProductionProblemsView> {
    const day = ServiceDay.of(query.serviceDay);
    const [open, current] = await Promise.all([this.reader.openOf(day), this.days.load(day)]);
    const problems = [...open]
      .sort((left, right) => left.reported.at.getTime() - right.reported.at.getTime())
      .map((problem) => viewOf(problem, current));
    const unconfirmed = await this.unconfirmed.of(day, current);
    return { serviceDay: day.value, problems, unconfirmed };
  }
}

function viewOf(problem: ProductionProblemState, current: ProductionDay): ProductionProblemView {
  return {
    id: problem.id,
    sku: problem.sku,
    productName:
      current.counts.find((item) => item.sku === problem.sku)?.productName ?? problem.sku,
    expected: problem.expected,
    produced: problem.produced,
    output: current.producedOf(problem.sku),
    reason: problem.reason,
    reportedAt: problem.reported.at.toISOString(),
    reportedByName: problem.reported.name,
    version: problem.version,
  };
}

import type { ProductionForecastView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ExpectedProductionReader } from "../../channels/commerce/expected-production.reader.js";
import { ProductionPlanReader } from "../../domain/ports/production-plan.reader.js";
import { forecastMatrix } from "../../domain/services/production-forecast.js";
import { ServiceRange } from "../../domain/value-objects/service-range.value-object.js";
import { GetProductionForecastQuery } from "./get-production-forecast.query.js";

/**
 * **Le mur qui arrive**, servi en une lecture.
 *
 * Le handler ne calcule rien : il lit deux sources, les passe à la fonction pure
 * qui porte la règle d'arbitrage, et traduit. C'est ce qui rend la règle — « le
 * plan arrêté l'emporte sur la demande attendue » — testable sans Nest, sans
 * base, et sans doubler quoi que ce soit.
 *
 * ⚠️ **Les deux lectures partent ensemble.** Elles ne se conditionnent pas l'une
 * l'autre : savoir quelles journées sont arrêtées ne change pas ce qu'on demande
 * au commerce, c'est la matrice qui écarte ce qu'elle ne doit pas empiler. Les
 * enchaîner doublerait la latence d'un écran qu'on ouvre en levant les yeux.
 *
 * Il n'écrit rien, pas même un compteur — §4.
 */
@QueryHandler(GetProductionForecastQuery)
export class GetProductionForecastHandler implements IQueryHandler<
  GetProductionForecastQuery,
  ProductionForecastView
> {
  constructor(
    private readonly plan: ProductionPlanReader,
    private readonly expected: ExpectedProductionReader,
  ) {}

  async execute(query: GetProductionForecastQuery): Promise<ProductionForecastView> {
    const range = ServiceRange.of(query.from, query.to);
    const [arrested, expected] = await Promise.all([
      this.plan.arrestedBetween(range),
      this.expected.expectedBetween(range),
    ]);
    const matrix = forecastMatrix(range, arrested, expected);
    return {
      days: matrix.columns,
      lines: matrix.rows,
      peakDate: matrix.peakDate,
      totalUnits: matrix.totalUnits,
    };
  }
}

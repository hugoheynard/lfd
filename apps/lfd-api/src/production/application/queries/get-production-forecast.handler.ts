import {
  instantToLocal,
  type ProductionForecastDay,
  type ProductionForecastView,
} from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { ExpectedProductionReader } from "../../channels/commerce/expected-production.reader.js";
import { ProductionCloseSettings } from "../../domain/entities/production-close-settings.js";
import {
  AutoCloseAttemptLog,
  type DatedAttemptTrace,
} from "../../domain/ports/auto-close-attempt-log.js";
import { ProductionPlanReader } from "../../domain/ports/production-plan.reader.js";
import { ProductionSettingsReader } from "../../domain/ports/production-settings.reader.js";
import { forecastDayState, type HouseMoment } from "../../domain/services/forecast-day-state.js";
import { forecastMatrix, type ForecastColumn } from "../../domain/services/production-forecast.js";
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
 * L'état de chaque colonne (plan `plan-arret-du-plan.md`, §5, lot A3) se dit
 * ici, à l'heure du `Clock`, avec le réglage, les jours fermés et les
 * tentatives automatiques lus en même temps que le reste.
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
    private readonly clock: Clock,
    private readonly settings: ProductionSettingsReader,
    private readonly attempts: AutoCloseAttemptLog,
  ) {}

  async execute(query: GetProductionForecastQuery): Promise<ProductionForecastView> {
    const range = ServiceRange.of(query.from, query.to);
    const [arrested, expected, settings, closedDays, attempts] = await Promise.all([
      this.plan.arrestedBetween(range),
      this.expected.expectedBetween(range),
      this.settings.closeSettings(),
      this.settings.closedDaysFrom(range.from.value),
      this.attempts.between(range),
    ]);
    const matrix = forecastMatrix(range, arrested, expected);
    const now = this.clock.now();
    const local = instantToLocal(now);
    const moment: HouseMoment = {
      today: local.day,
      time: local.time,
      now,
      settings: settings ?? ProductionCloseSettings.initial().values,
    };
    const closed = new Set(closedDays);
    return {
      days: matrix.columns.map((column) => withState(column, moment, closed, attempts)),
      lines: matrix.rows,
      peakDate: matrix.peakDate,
      totalUnits: matrix.totalUnits,
    };
  }
}

function withState(
  column: ForecastColumn,
  moment: HouseMoment,
  closedDays: ReadonlySet<string>,
  attempts: readonly DatedAttemptTrace[],
): ProductionForecastDay {
  const state = forecastDayState(
    {
      date: column.date,
      planClosed: column.closed,
      orderCount: column.orderCount,
      isClosedDay: closedDays.has(column.date),
      attempt: attempts.find((attempt) => attempt.day === column.date) ?? null,
    },
    moment,
  );
  return { ...column, state };
}

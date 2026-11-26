import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { InHousePeriodsReader } from "../../../account/domain/ports/in-house-periods.reader.js";
import { InHouseRecapRunsReader } from "../../domain/ports/in-house-recap-runs.reader.js";
import { PayerRecapsReader } from "../../domain/ports/payer-recaps.reader.js";
import { missedMonths } from "../../domain/services/missed-months.js";
import { RecapMonth } from "../../domain/value-objects/recap-month.js";
import type { PayerInHouseRecapsView } from "./in-house-recap.views.js";
import { ListPayerInHouseRecapsQuery } from "./list-payer-in-house-recaps.query.js";

/**
 * La liste de l'onglet « Récapitulatifs » (D9, D10) : un mois vide (issue
 * sans document) se distingue d'un mois manqué (aucune issue), jusqu'au
 * dernier mois clos à Paris.
 */
@QueryHandler(ListPayerInHouseRecapsQuery)
export class ListPayerInHouseRecapsHandler implements IQueryHandler<
  ListPayerInHouseRecapsQuery,
  PayerInHouseRecapsView
> {
  constructor(
    private readonly recaps: PayerRecapsReader,
    private readonly runs: InHouseRecapRunsReader,
    private readonly periods: InHousePeriodsReader,
    private readonly clock: Clock,
  ) {}

  async execute({ payerId }: ListPayerInHouseRecapsQuery): Promise<PayerInHouseRecapsView> {
    const [summaries, runs, periods] = await Promise.all([
      this.recaps.summariesOf(payerId),
      this.runs.runsOf(payerId),
      this.periods.periodsOf(payerId),
    ]);
    const attempted = new Set(runs.map((run) => run.month));
    return {
      recaps: summaries.map((summary) => ({
        ...summary,
        issuedAt: summary.issuedAt.toISOString(),
      })),
      emptyMonths: runs
        .filter((run) => run.recapId === null)
        .map((run) => run.month)
        .sort(),
      missedMonths: missedMonths(periods, attempted, RecapMonth.lastClosedAt(this.clock.now())),
    };
  }
}

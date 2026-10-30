import { instantToLocal, type MadeToOrderMonthlyView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { monthsEndingAt } from "../../domain/made-to-order/made-to-order-period.js";
import { monthlyRowsOf } from "../../domain/made-to-order/made-to-order-reports.js";
import { MadeToOrderMonthlyReader } from "../../domain/ports/made-to-order-monthly.reader.js";
import { GetMadeToOrderMonthlyQuery } from "./get-made-to-order-monthly.query.js";

/**
 * **Le sur mesure par mois** (lot R, plan sur mesure § 5 ter) : la fenêtre
 * part du premier jour du plus ancien mois et finit aujourd'hui, jour
 * métier du `Clock` ; le domaine range et calcule la part.
 */
@QueryHandler(GetMadeToOrderMonthlyQuery)
export class GetMadeToOrderMonthlyHandler implements IQueryHandler<
  GetMadeToOrderMonthlyQuery,
  MadeToOrderMonthlyView
> {
  constructor(
    private readonly reader: MadeToOrderMonthlyReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetMadeToOrderMonthlyQuery): Promise<MadeToOrderMonthlyView> {
    const today = instantToLocal(this.clock.now()).day;
    const months = monthsEndingAt(today.slice(0, 7), query.months);
    const from = `${months[0] ?? today.slice(0, 7)}-01`;
    const tallies = await this.reader.tallies(from, today);
    return { months: query.months, rows: monthlyRowsOf(months, tallies) };
  }
}

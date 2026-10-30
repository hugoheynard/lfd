import { MADE_TO_ORDER_MAX_PERIOD_DAYS, type MadeToOrderByClientView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { MadeToOrderPeriod } from "../../domain/made-to-order/made-to-order-period.js";
import { byClientReportOf } from "../../domain/made-to-order/made-to-order-reports.js";
import { MadeToOrderClientReader } from "../../domain/ports/made-to-order-client.reader.js";
import { GetMadeToOrderByClientQuery } from "./get-made-to-order-by-client.query.js";

/**
 * **Le sur mesure par client** (lot R, plan sur mesure § 5 ter) : la période
 * est validée par le domaine AVANT toute lecture, puis les lignes sont
 * rangées par client.
 */
@QueryHandler(GetMadeToOrderByClientQuery)
export class GetMadeToOrderByClientHandler implements IQueryHandler<
  GetMadeToOrderByClientQuery,
  MadeToOrderByClientView
> {
  constructor(private readonly reader: MadeToOrderClientReader) {}

  async execute(query: GetMadeToOrderByClientQuery): Promise<MadeToOrderByClientView> {
    const period = MadeToOrderPeriod.of(query.from, query.to, MADE_TO_ORDER_MAX_PERIOD_DAYS);
    const lines = await this.reader.lines(period.from, period.to);
    return byClientReportOf(period.from, period.to, lines);
  }
}

import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { OrderMetricsView } from "@lfd/contracts";

import { OrderMetricsReader } from "../../domain/ports/order-metrics.reader.js";
import { GetOrderMetricsQuery } from "./get-order-metrics.query.js";

@QueryHandler(GetOrderMetricsQuery)
export class GetOrderMetricsHandler implements IQueryHandler<
  GetOrderMetricsQuery,
  OrderMetricsView
> {
  constructor(private readonly reader: OrderMetricsReader) {}

  execute(): Promise<OrderMetricsView> {
    return this.reader.load();
  }
}

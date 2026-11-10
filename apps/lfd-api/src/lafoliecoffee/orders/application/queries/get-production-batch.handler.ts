import type { ProductionBatchView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderReader } from "../../domain/ports/order.reader.js";
import { GetProductionBatchQuery } from "./get-production-batch.query.js";

/**
 * Sert le lot d'une journée. Rien à composer : aucune commande ne peut être
 * passée sans jour de retrait/livraison, donc le lot d'une date est exhaustif —
 * il n'y a pas d'orphelines à signaler à côté.
 */
@QueryHandler(GetProductionBatchQuery)
export class GetProductionBatchHandler implements IQueryHandler<
  GetProductionBatchQuery,
  ProductionBatchView
> {
  constructor(private readonly orders: OrderReader) {}

  async execute(query: GetProductionBatchQuery): Promise<ProductionBatchView> {
    return { date: query.date, sheets: await this.orders.listForProduction(query.date) };
  }
}

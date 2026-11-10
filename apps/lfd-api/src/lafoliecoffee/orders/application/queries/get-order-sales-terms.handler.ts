import type { OrderSalesTermsResponse } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderSalesTermsRecordReader } from "../../domain/ports/order-sales-terms-record.reader.js";
import { GetOrderSalesTermsQuery } from "./get-order-sales-terms.query.js";

/**
 * **Les CGV d'une commande** (plan `legal/plan-cgv-par-audience.md`, C4) :
 * le texte, sa révision et le PDF en vigueur à sa passation. Lecture pure.
 *
 * @throws {OrderNotFoundError} aucune commande sous cet id.
 */
@QueryHandler(GetOrderSalesTermsQuery)
export class GetOrderSalesTermsHandler implements IQueryHandler<
  GetOrderSalesTermsQuery,
  OrderSalesTermsResponse
> {
  constructor(private readonly records: OrderSalesTermsRecordReader) {}

  async execute(query: GetOrderSalesTermsQuery): Promise<OrderSalesTermsResponse> {
    const found = await this.records.of(query.orderId);
    if (found === null) {
      throw new OrderNotFoundError(query.orderId);
    }
    return found;
  }
}

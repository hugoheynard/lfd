import type { OrderOpeningView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderOpeningReader } from "../../domain/ports/order-opening.reader.js";
import { GetOrderOpeningQuery } from "./get-order-opening.query.js";

/** Sert le réglage d'ouverture, au back-office comme à la boutique. Lecture pure. */
@QueryHandler(GetOrderOpeningQuery)
export class GetOrderOpeningHandler implements IQueryHandler<
  GetOrderOpeningQuery,
  OrderOpeningView
> {
  constructor(private readonly settings: OrderOpeningReader) {}

  execute(): Promise<OrderOpeningView> {
    return this.settings.current();
  }
}

import type { OrderCutoffSettingsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderCutoffSettingsReader } from "../domain/order-cutoff-settings.reader.js";
import { GetOrderCutoffSettingsQuery } from "./get-order-cutoff-settings.query.js";

/** Sert le réglage du jour même au back-office. Lecture pure. */
@QueryHandler(GetOrderCutoffSettingsQuery)
export class GetOrderCutoffSettingsHandler implements IQueryHandler<
  GetOrderCutoffSettingsQuery,
  OrderCutoffSettingsView
> {
  constructor(private readonly settings: OrderCutoffSettingsReader) {}

  execute(): Promise<OrderCutoffSettingsView> {
    return this.settings.current();
  }
}

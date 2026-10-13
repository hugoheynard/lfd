import type { CustomerCancellationSettingsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CustomerCancellationSettingsReader } from "../../domain/ports/customer-cancellation-settings.reader.js";
import { GetCustomerCancellationSettingsQuery } from "./get-customer-cancellation-settings.query.js";

/** Sert le réglage d'annulation par le client au back-office. Lecture pure. */
@QueryHandler(GetCustomerCancellationSettingsQuery)
export class GetCustomerCancellationSettingsHandler implements IQueryHandler<
  GetCustomerCancellationSettingsQuery,
  CustomerCancellationSettingsView
> {
  constructor(private readonly settings: CustomerCancellationSettingsReader) {}

  execute(): Promise<CustomerCancellationSettingsView> {
    return this.settings.current();
  }
}

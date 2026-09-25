import type { CounterCustomerCard } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CounterCustomerReader } from "../../domain/ports/counter-customer.reader.js";
import { ListCounterCustomersQuery } from "./list-counter-customers.query.js";

/**
 * Sert au Comptoir les sociétés **actives** — celles qu'on sert au prix pro.
 * Cross-tenant assumé, gardé en amont par `@AdminSurface("b2b_counter")`.
 */
@QueryHandler(ListCounterCustomersQuery)
export class ListCounterCustomersHandler implements IQueryHandler<
  ListCounterCustomersQuery,
  readonly CounterCustomerCard[]
> {
  constructor(private readonly customers: CounterCustomerReader) {}

  execute(): Promise<readonly CounterCustomerCard[]> {
    return this.customers.listActive();
  }
}

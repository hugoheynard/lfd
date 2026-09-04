import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { OrderTimeLimitView } from "@lfd/pim-contracts";

import { OrderTimeLimitRepository } from "../domain/ports/order-time-limit.repository.js";

export class ListOrderTimeLimitsQuery {}

/** Toutes les règles posées, pour l'écran de réglages. Lecture pure. */
@QueryHandler(ListOrderTimeLimitsQuery)
export class ListOrderTimeLimitsHandler implements IQueryHandler<
  ListOrderTimeLimitsQuery,
  readonly OrderTimeLimitView[]
> {
  constructor(private readonly limits: OrderTimeLimitRepository) {}

  async execute(): Promise<readonly OrderTimeLimitView[]> {
    return this.limits.list();
  }
}

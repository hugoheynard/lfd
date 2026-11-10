import type { OrderCutoffWaiverView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderCutoffWaiverRepository } from "../domain/order-cutoff-waiver.repository.js";
import { ListOrderCutoffWaiversQuery } from "./list-order-cutoff-waivers.query.js";

/** Les dérogations d'un client, telles que la fiche les affiche. */
@QueryHandler(ListOrderCutoffWaiversQuery)
export class ListOrderCutoffWaiversHandler implements IQueryHandler<
  ListOrderCutoffWaiversQuery,
  readonly OrderCutoffWaiverView[]
> {
  constructor(private readonly waivers: OrderCutoffWaiverRepository) {}

  async execute(query: ListOrderCutoffWaiversQuery): Promise<readonly OrderCutoffWaiverView[]> {
    return this.waivers.listFor(query.companyId);
  }
}

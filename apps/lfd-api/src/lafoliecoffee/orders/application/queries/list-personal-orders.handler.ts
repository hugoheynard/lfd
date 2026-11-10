import type { OrderView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderReader } from "../../domain/ports/order.reader.js";
import { ListPersonalOrdersQuery } from "./list-personal-orders.query.js";

/** Sert les commandes personnelles d'un client (mur = son seul `actorUserId`). */
@QueryHandler(ListPersonalOrdersQuery)
export class ListPersonalOrdersHandler implements IQueryHandler<
  ListPersonalOrdersQuery,
  readonly OrderView[]
> {
  constructor(private readonly orders: OrderReader) {}

  async execute(query: ListPersonalOrdersQuery): Promise<readonly OrderView[]> {
    return this.orders.listPersonal(query.actorUserId);
  }
}

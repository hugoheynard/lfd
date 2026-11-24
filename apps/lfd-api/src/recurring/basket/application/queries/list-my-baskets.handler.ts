import type { SubscriptionView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BasketReader } from "../../domain/ports/basket.reader.js";
import { ListMyBasketsQuery } from "./list-my-baskets.query.js";

/** Sert les paniers d'un client (mur = son `actorUserId`). */
@QueryHandler(ListMyBasketsQuery)
export class ListMyBasketsHandler implements IQueryHandler<
  ListMyBasketsQuery,
  readonly SubscriptionView[]
> {
  constructor(private readonly baskets: BasketReader) {}

  execute(query: ListMyBasketsQuery): Promise<readonly SubscriptionView[]> {
    return this.baskets.listForBuyer(query.actorUserId);
  }
}

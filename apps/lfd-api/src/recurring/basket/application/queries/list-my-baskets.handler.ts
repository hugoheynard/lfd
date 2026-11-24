import type { SubscriptionView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { BasketReader } from "../../domain/ports/basket.reader.js";
import { occurrenceWindowStart } from "../services/occurrence-window.js";
import { ListMyBasketsQuery } from "./list-my-baskets.query.js";

/**
 * Sert les paniers d'un client (mur = son `actorUserId`), avec les échéances
 * des quatre semaines passées et celles créées à l'avance.
 */
@QueryHandler(ListMyBasketsQuery)
export class ListMyBasketsHandler implements IQueryHandler<
  ListMyBasketsQuery,
  readonly SubscriptionView[]
> {
  constructor(
    private readonly baskets: BasketReader,
    private readonly clock: Clock,
  ) {}

  execute(query: ListMyBasketsQuery): Promise<readonly SubscriptionView[]> {
    return this.baskets.listForBuyer(query.actorUserId, occurrenceWindowStart(this.clock.now()));
  }
}

import type { SubscriptionView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { SubscriptionReader } from "../../domain/ports/subscription.reader.js";
import { ListSubscriptionsQuery } from "./list-subscriptions.query.js";

/** Sert les paniers récurrents d'un client (mur = son `actorUserId`). */
@QueryHandler(ListSubscriptionsQuery)
export class ListSubscriptionsHandler implements IQueryHandler<
  ListSubscriptionsQuery,
  readonly SubscriptionView[]
> {
  constructor(private readonly subscriptions: SubscriptionReader) {}

  async execute(query: ListSubscriptionsQuery): Promise<readonly SubscriptionView[]> {
    return this.subscriptions.listForUser(query.actorUserId);
  }
}

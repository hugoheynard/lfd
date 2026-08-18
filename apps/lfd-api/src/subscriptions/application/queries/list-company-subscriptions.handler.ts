import type { AdminSubscriptionRow } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { SubscriptionReader } from "../../domain/ports/subscription.reader.js";
import { ListCompanySubscriptionsQuery } from "./list-company-subscriptions.query.js";

/**
 * Sert les paniers récurrents d'un **compte**. Aucun mur ici : la surface est
 * `@AdminSurface`, donc déjà murée par l'identité staff et son périmètre. Une
 * société inconnue rend une liste vide, comme une société sans panier — le
 * back-office sait déjà par ailleurs si elle existe.
 */
@QueryHandler(ListCompanySubscriptionsQuery)
export class ListCompanySubscriptionsHandler implements IQueryHandler<
  ListCompanySubscriptionsQuery,
  readonly AdminSubscriptionRow[]
> {
  constructor(private readonly subscriptions: SubscriptionReader) {}

  execute(query: ListCompanySubscriptionsQuery): Promise<readonly AdminSubscriptionRow[]> {
    return this.subscriptions.listForCompany(query.companyId);
  }
}

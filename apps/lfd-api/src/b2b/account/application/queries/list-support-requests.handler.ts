import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { SupportRequestView } from "@lfd/contracts";

import { SupportRequestRepository } from "../../domain/ports/support-request.repository.js";
import { ListSupportRequestsQuery } from "./list-support-requests.query.js";

/** La file staff des demandes de contact. */
@QueryHandler(ListSupportRequestsQuery)
export class ListSupportRequestsHandler implements IQueryHandler<
  ListSupportRequestsQuery,
  readonly SupportRequestView[]
> {
  constructor(private readonly support: SupportRequestRepository) {}

  async execute(query: ListSupportRequestsQuery): Promise<readonly SupportRequestView[]> {
    return this.support.list(query.openOnly);
  }
}

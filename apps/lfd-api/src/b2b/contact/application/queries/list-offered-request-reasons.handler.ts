import type { PublicRequestReasonView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { RequestReasonReader } from "../../domain/ports/request-reason.reader.js";
import { ListOfferedRequestReasonsQuery } from "./list-offered-request-reasons.query.js";

/** Sert à la boutique les motifs actifs d'un formulaire pour ce public, sans adresse. Lecture pure. */
@QueryHandler(ListOfferedRequestReasonsQuery)
export class ListOfferedRequestReasonsHandler implements IQueryHandler<
  ListOfferedRequestReasonsQuery,
  PublicRequestReasonView[]
> {
  constructor(private readonly reasons: RequestReasonReader) {}

  execute(query: ListOfferedRequestReasonsQuery): Promise<PublicRequestReasonView[]> {
    return this.reasons.offered(query.kind, query.audience);
  }
}

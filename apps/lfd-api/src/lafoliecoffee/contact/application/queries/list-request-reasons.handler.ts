import type { RequestReasonView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { RequestReasonReader } from "../../domain/ports/request-reason.reader.js";
import { ListRequestReasonsQuery } from "./list-request-reasons.query.js";

/** Sert les motifs d'un formulaire au back-office, adresses comprises. Lecture pure. */
@QueryHandler(ListRequestReasonsQuery)
export class ListRequestReasonsHandler implements IQueryHandler<
  ListRequestReasonsQuery,
  RequestReasonView[]
> {
  constructor(private readonly reasons: RequestReasonReader) {}

  execute(query: ListRequestReasonsQuery): Promise<RequestReasonView[]> {
    return this.reasons.list(query.kind);
  }
}

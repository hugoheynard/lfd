import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import type { ProspectView } from "../../domain/prospect.js";
import { ProspectReader } from "../../domain/ports/prospect.reader.js";
import { ListProspectsQuery } from "./list-prospects.query.js";

/** Délègue au reader (projection du journal) — aucune logique propre. */
@QueryHandler(ListProspectsQuery)
export class ListProspectsHandler implements IQueryHandler<ListProspectsQuery, ProspectView[]> {
  constructor(private readonly prospects: ProspectReader) {}

  execute(): Promise<ProspectView[]> {
    return this.prospects.list();
  }
}

import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import type { LeadView } from "@lfd/contracts";
import { LeadReader } from "../../domain/ports/lead.reader.js";
import { ListLeadsQuery } from "./list-leads.query.js";

/** Délègue au reader — aucune logique propre. */
@QueryHandler(ListLeadsQuery)
export class ListLeadsHandler implements IQueryHandler<ListLeadsQuery, LeadView[]> {
  constructor(private readonly leads: LeadReader) {}

  execute(): Promise<LeadView[]> {
    return this.leads.list();
  }
}

import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import type { ProspectView } from "@lfd/contracts";
import { prospectsFrom } from "../../domain/prospect.js";
import { LeadReader } from "../../domain/ports/lead.reader.js";
import { ListProspectsQuery } from "./list-prospects.query.js";

/**
 * Compose la file **Prospects** : les établissements démarchés encore ouverts,
 * lus sur l'agrégat `Lead` puis filtrés par la fonction pure `prospectsFrom`.
 */
@QueryHandler(ListProspectsQuery)
export class ListProspectsHandler implements IQueryHandler<ListProspectsQuery, ProspectView[]> {
  constructor(private readonly leads: LeadReader) {}

  async execute(): Promise<ProspectView[]> {
    return prospectsFrom(await this.leads.list());
  }
}

import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import type { ProspectView } from "@lfd/contracts";
import { Clock } from "../../../../platform/time/clock.js";
import { mergeProspects } from "../../domain/prospect.js";
import { LeadReader } from "../../domain/ports/lead.reader.js";
import { ProspectReader } from "../../domain/ports/prospect.reader.js";
import { ListProspectsQuery } from "./list-prospects.query.js";

/**
 * Compose la **file entrante unifiée** : les prospects **entrants** (hot/mid,
 * projection du journal) fusionnés avec les leads **cold** actifs (agrégat de
 * démarchage), via la fonction pure `mergeProspects` (temps du `Clock`). Les leads
 * clos sont écartés par la fusion (dédup avec la projection).
 */
@QueryHandler(ListProspectsQuery)
export class ListProspectsHandler implements IQueryHandler<ListProspectsQuery, ProspectView[]> {
  constructor(
    private readonly prospects: ProspectReader,
    private readonly leads: LeadReader,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<ProspectView[]> {
    const [inbound, leads] = await Promise.all([this.prospects.list(), this.leads.list()]);
    return mergeProspects(inbound, leads, this.clock.now());
  }
}

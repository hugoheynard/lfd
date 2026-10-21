import { RESUPPLY_USED_NAMES_MAX, type SiteResuppliesView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { ResupplyCutoff } from "../domain/resupply-cutoff.js";
import { ResupplyUsedNames } from "../domain/resupply-used-names.js";
import { isPlaced } from "../domain/site-resupply.js";
import { SiteResupplyReader } from "../domain/site-resupply.reader.js";
import { ListSiteResuppliesQuery } from "./list-site-resupplies.query.js";
import { resupplyDays } from "./resupply-days.js";
import { siteResupplyDraftView, siteResupplyView } from "./site-resupply-view.js";

/**
 * Sert la liste du comptoir : les demandes en cours du point (lot R1c) et
 * ses réassorts envoyés pour aujourd'hui et demain, annulés compris, et
 * jusqu'à quand « Pour demain » est accepté — et, depuis R1g, les noms
 * déjà employés au point, proposés à la saisie.
 */
@QueryHandler(ListSiteResuppliesQuery)
export class ListSiteResuppliesHandler implements IQueryHandler<
  ListSiteResuppliesQuery,
  SiteResuppliesView
> {
  constructor(
    private readonly reader: SiteResupplyReader,
    private readonly cutoff: ResupplyCutoff,
    private readonly clock: Clock,
    private readonly names: ResupplyUsedNames,
  ) {}

  async execute(query: ListSiteResuppliesQuery): Promise<SiteResuppliesView> {
    const { today, tomorrow } = resupplyDays(this.clock.now());
    const [resupplies, deadline, usedNames] = await Promise.all([
      this.reader.forSite(query.siteId, [today, tomorrow]),
      this.cutoff.deadlineFor(tomorrow),
      this.names.usedAt(query.siteId, RESUPPLY_USED_NAMES_MAX),
    ]);
    return {
      siteId: query.siteId,
      today,
      tomorrow,
      tomorrowOrderUntil: deadline?.toISOString() ?? null,
      drafts: resupplies.filter((resupply) => !isPlaced(resupply)).map(siteResupplyDraftView),
      resupplies: resupplies.filter(isPlaced).map(siteResupplyView),
      usedNames,
    };
  }
}

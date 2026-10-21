import type { SiteResuppliesView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { ResupplyCutoff } from "../domain/resupply-cutoff.js";
import { SiteResupplyReader } from "../domain/site-resupply.reader.js";
import { ListSiteResuppliesQuery } from "./list-site-resupplies.query.js";
import { resupplyDays } from "./resupply-days.js";
import { siteResupplyView } from "./site-resupply-view.js";

/**
 * Sert la liste du comptoir : les réassorts du point pour aujourd'hui et
 * demain, annulés compris, et jusqu'à quand « Pour demain » est accepté.
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
  ) {}

  async execute(query: ListSiteResuppliesQuery): Promise<SiteResuppliesView> {
    const { today, tomorrow } = resupplyDays(this.clock.now());
    const [resupplies, deadline] = await Promise.all([
      this.reader.forSite(query.siteId, [today, tomorrow]),
      this.cutoff.deadlineFor(tomorrow),
    ]);
    return {
      siteId: query.siteId,
      today,
      tomorrow,
      tomorrowOrderUntil: deadline?.toISOString() ?? null,
      resupplies: resupplies.map(siteResupplyView),
    };
  }
}

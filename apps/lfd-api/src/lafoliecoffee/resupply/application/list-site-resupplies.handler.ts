import { RESUPPLY_USED_NAMES_MAX, type SiteResuppliesView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { CounterStockTracking } from "../domain/counter-stock-tracking.js";
import { ResupplyArrivalSuggestions } from "../domain/resupply-arrival-suggestions.js";
import { ResupplyCutoff } from "../domain/resupply-cutoff.js";
import { ResupplyUsedNames } from "../domain/resupply-used-names.js";
import { isPlaced } from "../domain/site-resupply.js";
import { SiteResupplyReader } from "../domain/site-resupply.reader.js";
import { ListSiteResuppliesQuery } from "./list-site-resupplies.query.js";
import { resupplyDays } from "./resupply-days.js";
import { siteResupplyDraftView, siteResupplyView } from "./site-resupply-view.js";

/**
 * Sert la liste du comptoir : les demandes en cours du point (R1c) et
 * ses réassorts envoyés pour aujourd'hui et demain, annulés compris, et
 * jusqu'à quand « Pour demain » est accepté — et, depuis le nom du réassort (R1g), les noms
 * déjà employés au point, proposés à la saisie ; et si le point suit son
 * stock au comptoir (Réglages › Comptoir) ; et l'heure d'arrivée que le
 * point demande pour demain, que l'écran propose (H-D3).
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
    private readonly tracking: CounterStockTracking,
    private readonly arrivals: ResupplyArrivalSuggestions,
  ) {}

  async execute(query: ListSiteResuppliesQuery): Promise<SiteResuppliesView> {
    const { today, tomorrow } = resupplyDays(this.clock.now());
    const [resupplies, deadline, usedNames, stockTracking, arrivals] = await Promise.all([
      this.reader.forSite(query.siteId, [today, tomorrow]),
      this.cutoff.deadlineFor(tomorrow),
      this.names.usedAt(query.siteId, RESUPPLY_USED_NAMES_MAX),
      this.tracking.isTrackedAt(query.siteId),
      this.arrivals.requiredArrivals(tomorrow, [query.siteId]),
    ]);
    return {
      siteId: query.siteId,
      today,
      tomorrow,
      tomorrowOrderUntil: deadline?.toISOString() ?? null,
      suggestedArrivalBy: arrivals.get(query.siteId) ?? null,
      drafts: resupplies.filter((resupply) => !isPlaced(resupply)).map(siteResupplyDraftView),
      resupplies: resupplies.filter(isPlaced).map(siteResupplyView),
      usedNames,
      stockTracking,
    };
  }
}

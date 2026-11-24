import type { BakehouseResupplyDraftView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import type { BakehouseResupplyDraftSnapshot } from "../domain/bakehouse-resupply-draft.js";
import { BakehouseResupplyDraftReader } from "../domain/bakehouse-resupply-draft.reader.js";
import { ResupplyArrivalSuggestions } from "../domain/resupply-arrival-suggestions.js";
import { serviceDayFor } from "../domain/site-resupply.js";
import { ListBakehouseResupplyDraftsQuery } from "./list-bakehouse-resupply-drafts.query.js";

function viewOf(
  draft: BakehouseResupplyDraftSnapshot,
  arrivals: ReadonlyMap<string, string>,
): BakehouseResupplyDraftView {
  return {
    id: draft.id,
    version: draft.version,
    siteId: draft.content.siteId,
    target: draft.content.target,
    name: draft.content.name,
    arrivalBy: draft.content.arrivalBy ?? null,
    suggestedArrivalBy: arrivals.get(draft.content.siteId) ?? null,
    lines: draft.content.lines,
    savedByName: draft.updated.author.name,
    savedAt: draft.updated.at.toISOString(),
  };
}

/**
 * La liste courte de la carte du fournil : les brouillons ouverts, le plus
 * récent d'abord — chacun avec l'heure d'arrivée que son point demande pour
 * demain, que l'écran propose quand le brouillon n'en a pas (H-D3).
 */
@QueryHandler(ListBakehouseResupplyDraftsQuery)
export class ListBakehouseResupplyDraftsHandler implements IQueryHandler<
  ListBakehouseResupplyDraftsQuery,
  readonly BakehouseResupplyDraftView[]
> {
  constructor(
    private readonly reader: BakehouseResupplyDraftReader,
    private readonly arrivals: ResupplyArrivalSuggestions,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<readonly BakehouseResupplyDraftView[]> {
    const drafts = await this.reader.listOpen();
    const siteIds = [...new Set(drafts.map((draft) => draft.content.siteId))];
    const tomorrow = serviceDayFor("tomorrow", this.clock.now());
    const arrivals = await this.arrivals.requiredArrivals(tomorrow, siteIds);
    return drafts.map((draft) => viewOf(draft, arrivals));
  }
}

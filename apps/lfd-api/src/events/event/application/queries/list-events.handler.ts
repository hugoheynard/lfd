import type { EventSummaryView } from "@lfd/contracts";
import { instantToLocal } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { EventReader } from "../../domain/ports/event.reader.js";
import { ListEventsQuery } from "./list-events.query.js";

/**
 * Sert la table, plus proche d'abord. « Aujourd'hui » est le jour de Paris :
 * un événement vit au calendrier du fournil, pas en UTC.
 */
@QueryHandler(ListEventsQuery)
export class ListEventsHandler implements IQueryHandler<
  ListEventsQuery,
  readonly EventSummaryView[]
> {
  constructor(
    private readonly events: EventReader,
    private readonly clock: Clock,
  ) {}

  execute(query: ListEventsQuery): Promise<readonly EventSummaryView[]> {
    const today = instantToLocal(this.clock.now()).day;
    return this.events.list({ from: query.from, to: query.to }, today);
  }
}

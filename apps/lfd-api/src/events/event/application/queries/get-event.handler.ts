import type { EventDetailView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { EventNotFoundError } from "../../domain/errors/event-errors.js";
import { EventReader } from "../../domain/ports/event.reader.js";
import { GetEventQuery } from "./get-event.query.js";

/** Sert le détail d'un événement — 404 s'il n'existe pas. */
@QueryHandler(GetEventQuery)
export class GetEventHandler implements IQueryHandler<GetEventQuery, EventDetailView> {
  constructor(private readonly events: EventReader) {}

  async execute(query: GetEventQuery): Promise<EventDetailView> {
    const detail = await this.events.detail(query.eventId);
    if (detail === null) {
      throw new EventNotFoundError(query.eventId);
    }
    return detail;
  }
}

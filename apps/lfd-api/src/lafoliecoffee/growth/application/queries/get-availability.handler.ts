import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { AvailabilityConfigView } from "@lfd/contracts";

import { AvailabilityStore } from "../../domain/ports/availability.store.js";
import { GetAvailabilityQuery } from "./get-availability.query.js";

/** La disponibilité déclarée, telle quelle — l'écran de réglages la rejoue. */
@QueryHandler(GetAvailabilityQuery)
export class GetAvailabilityHandler implements IQueryHandler<
  GetAvailabilityQuery,
  AvailabilityConfigView
> {
  constructor(private readonly availability: AvailabilityStore) {}

  async execute(): Promise<AvailabilityConfigView> {
    return this.availability.load();
  }
}

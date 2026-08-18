import type { DeliveryZoneView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { DeliveryZoneRepository } from "../domain/delivery-zone.repository.js";
import { ListDeliveryZonesQuery } from "./list-delivery-zones.query.js";

/** Sert la liste des zones de livraison. Lecture pure. */
@QueryHandler(ListDeliveryZonesQuery)
export class ListDeliveryZonesHandler implements IQueryHandler<
  ListDeliveryZonesQuery,
  readonly DeliveryZoneView[]
> {
  constructor(private readonly zones: DeliveryZoneRepository) {}

  execute(): Promise<readonly DeliveryZoneView[]> {
    return this.zones.list();
  }
}

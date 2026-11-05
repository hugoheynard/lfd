import type { AdminDeliveryZoneView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { DeliveryZoneTermsReader } from "../domain/ports/delivery-zone-terms.reader.js";
import { ListAdminDeliveryZonesQuery } from "./list-admin-delivery-zones.query.js";

/** Sert au back-office les zones et leurs remplacements par audience. Lecture pure. */
@QueryHandler(ListAdminDeliveryZonesQuery)
export class ListAdminDeliveryZonesHandler implements IQueryHandler<
  ListAdminDeliveryZonesQuery,
  readonly AdminDeliveryZoneView[]
> {
  constructor(private readonly zones: DeliveryZoneTermsReader) {}

  execute(): Promise<readonly AdminDeliveryZoneView[]> {
    return this.zones.list();
  }
}

import type { DeliveryZoneView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { Public } from "../../infra/auth/public.decorator.js";
import { ListDeliveryZonesQuery } from "../application/list-delivery-zones.query.js";

/**
 * Lecture **publique** des zones de livraison — le client (checkout) en a besoin
 * pour afficher le frais de sa zone. Non sensible (config globale). L'écriture est
 * staff ({@link AdminDeliveryZonesController}).
 */
@Controller("delivery-zones")
@Public()
export class DeliveryZonesController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  list(): Promise<readonly DeliveryZoneView[]> {
    return this.queries.execute<ListDeliveryZonesQuery, readonly DeliveryZoneView[]>(
      new ListDeliveryZonesQuery(),
    );
  }
}

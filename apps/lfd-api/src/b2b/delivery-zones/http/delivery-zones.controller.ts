import type { DeliveryZoneView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ListDeliveryZonesQuery } from "../application/list-delivery-zones.query.js";

/**
 * Lecture **publique** des zones de livraison — le client (checkout) en a besoin
 * pour afficher le frais de sa zone. Non sensible (config globale). L'écriture est
 * staff ({@link AdminDeliveryZonesController}).
 *
 * Surface anonyme ⇒ throttle resserré (60/min/IP) sous le défaut global.
 */
@Controller("delivery-zones")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class DeliveryZonesController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  list(): Promise<readonly DeliveryZoneView[]> {
    return this.queries.execute<ListDeliveryZonesQuery, readonly DeliveryZoneView[]>(
      new ListDeliveryZonesQuery(),
    );
  }
}

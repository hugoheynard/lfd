import type { AudienceDeliveryZoneView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { audienceDeliveryZone } from "../domain/delivery-fee-resolution.js";
import { DeliveryPricingReader } from "../domain/ports/delivery-pricing.reader.js";
import { DeliveryZoneTermsReader } from "../domain/ports/delivery-zone-terms.reader.js";
import { ListDeliveryZonesQuery } from "./list-delivery-zones.query.js";

/**
 * Sert les zones de livraison d'une clientèle, frais et seuil résolus par la
 * même fonction que le devis (`audienceDeliveryZone`). Lecture pure ; ne lit
 * jamais l'appelant (`lint:cache-control`, `CALLER_BLIND`).
 */
@QueryHandler(ListDeliveryZonesQuery)
export class ListDeliveryZonesHandler implements IQueryHandler<
  ListDeliveryZonesQuery,
  readonly AudienceDeliveryZoneView[]
> {
  constructor(
    private readonly zones: DeliveryZoneTermsReader,
    private readonly pricing: DeliveryPricingReader,
  ) {}

  async execute(query: ListDeliveryZonesQuery): Promise<readonly AudienceDeliveryZoneView[]> {
    const [zones, global] = await Promise.all([this.zones.list(), this.pricing.current()]);
    return zones.map((zone) => audienceDeliveryZone(query.audience, zone, global));
  }
}

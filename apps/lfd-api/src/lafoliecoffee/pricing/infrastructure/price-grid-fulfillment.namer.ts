import { Injectable } from "@nestjs/common";

import { DeliveryZoneRepository } from "../../delivery-zones/domain/delivery-zone.repository.js";
import { PickupAddressRepository } from "../../pickup-addresses/domain/pickup-address.repository.js";
import { PriceGridFulfillmentNamer } from "../domain/ports/price-grid-fulfillment.namer.js";

/** Les noms d'un point et d'une zone, lus par les dépôts de leurs contextes. */
@Injectable()
export class RepositoryPriceGridFulfillmentNamer extends PriceGridFulfillmentNamer {
  constructor(
    private readonly pickups: PickupAddressRepository,
    private readonly zones: DeliveryZoneRepository,
  ) {
    super();
  }

  async pickupNameOf(pickupId: string): Promise<string | null> {
    return (await this.pickups.resolve(pickupId))?.label ?? null;
  }

  async zoneNameOf(zoneId: string): Promise<string | null> {
    return (await this.zones.findById(zoneId))?.label ?? null;
  }
}

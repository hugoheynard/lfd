import { Injectable } from "@nestjs/common";

import { BasketPickupPoints } from "../../../recurring/channels/commerce/index.js";
import { PickupPointNames } from "../../account/domain/ports/pickup-point-names.js";

/**
 * **Le nom d'un point de retrait, pour les paniers récurrents** — le port
 * qu'ils déclarent, implémenté par les points de retrait avec la lecture que
 * le journal des comptes emploie déjà.
 */
@Injectable()
export class SiteBasketPickupPoints extends BasketPickupPoints {
  constructor(private readonly names: PickupPointNames) {
    super();
  }

  nameOf(pickupAddressId: string): Promise<string | null> {
    return this.names.nameOf(pickupAddressId);
  }
}

import { Injectable } from "@nestjs/common";

import {
  type DeliveryColors,
  DeliveryColorsReader,
} from "../../../delivery/channels/commerce/index.js";
import { DepartureDeliveryColors } from "../application/departure-delivery-colors.js";

/** L'adaptateur de `DeliveryColorsReader` (livraison) : la lecture du commerce, telle quelle. */
@Injectable()
export class SiteDeliveryColorsReader extends DeliveryColorsReader {
  constructor(private readonly colors: DepartureDeliveryColors) {
    super();
  }

  departureColors(): Promise<DeliveryColors> {
    return this.colors.colors();
  }
}

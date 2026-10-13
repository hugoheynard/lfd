import { Injectable } from "@nestjs/common";

import {
  RunSheetColorsReader,
  type RunSheetDeliveryColors,
} from "../../../handover/channels/commerce/index.js";
import { DepartureDeliveryColors } from "../application/departure-delivery-colors.js";

/** L'adaptateur de `RunSheetColorsReader` (retrait) : la lecture du commerce, telle quelle. */
@Injectable()
export class SiteRunSheetColorsReader extends RunSheetColorsReader {
  constructor(private readonly colors: DepartureDeliveryColors) {
    super();
  }

  departureColors(): Promise<RunSheetDeliveryColors> {
    return this.colors.colors();
  }
}

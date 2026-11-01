import { DEFAULT_DELIVERY_AVAILABILITY, type DeliveryAvailabilityView } from "@lfd/contracts";

import { DeliveryAvailabilityReader } from "../delivery-availability.reader.js";

/** Un réglage de livraison donné, ouvert aux deux clientèles par défaut. */
export class GivenDeliveryAvailability extends DeliveryAvailabilityReader {
  constructor(
    private readonly opening: Partial<
      Pick<DeliveryAvailabilityView, "openToB2b" | "openToB2c">
    > = {},
  ) {
    super();
  }

  current(): Promise<DeliveryAvailabilityView> {
    return Promise.resolve({ ...DEFAULT_DELIVERY_AVAILABILITY, ...this.opening });
  }
}

import type { CustomerAudience } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import {
  DeliveryZoneFeeReader,
  type PricedDeliveryZone,
} from "../../orders/domain/ports/delivery-zone-fee.reader.js";
import { resolvedDeliveryFee } from "../domain/delivery-fee-resolution.js";
import { DeliveryPricingReader } from "../domain/ports/delivery-pricing.reader.js";
import { DeliveryZoneTermsReader } from "../domain/ports/delivery-zone-terms.reader.js";
import { zoneOfPostalCode } from "../domain/zone-of-postal-code.js";

/**
 * L'adaptateur de `DeliveryZoneFeeReader` (commandes) : la zone du préfixe le
 * plus long, et le frais de l'audience résolu par {@link resolvedDeliveryFee}.
 * Les zones et le réglage global sont lus ensemble.
 */
@Injectable()
export class DeliveryZoneFeeResolver extends DeliveryZoneFeeReader {
  constructor(
    private readonly zones: DeliveryZoneTermsReader,
    private readonly pricing: DeliveryPricingReader,
  ) {
    super();
  }

  async zoneFor(
    codePostal: string,
    audience: CustomerAudience,
  ): Promise<PricedDeliveryZone | null> {
    const [zones, global] = await Promise.all([this.zones.list(), this.pricing.current()]);
    const found = zoneOfPostalCode(zones, codePostal);
    if (found === null) {
      return null;
    }
    const zone = {
      id: found.id,
      postalPrefixes: found.postalPrefixes,
      label: found.label,
      fee: found.fee,
    };
    return { zone, fee: resolvedDeliveryFee(audience, found, global) };
  }
}

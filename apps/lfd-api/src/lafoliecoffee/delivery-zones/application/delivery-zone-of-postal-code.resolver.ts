import { Injectable } from "@nestjs/common";

import { DeliveryZoneOfPostalCodeReader } from "../../orders/domain/ports/delivery-zone-of-postal-code.reader.js";
import { DeliveryZoneRepository } from "../domain/delivery-zone.repository.js";

/**
 * L'adaptateur de `DeliveryZoneOfPostalCodeReader` (commandes) : la zone que
 * `resolveForPostalCode` retient — la même que celle des frais.
 */
@Injectable()
export class DeliveryZoneOfPostalCodeResolver extends DeliveryZoneOfPostalCodeReader {
  constructor(private readonly zones: DeliveryZoneRepository) {
    super();
  }

  async zoneIdOf(codePostal: string): Promise<string | null> {
    return (await this.zones.resolveForPostalCode(codePostal))?.id ?? null;
  }
}

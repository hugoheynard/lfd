import type { GpsPoint, PickupAddressPayload } from "@lfd/contracts";

import type { PickupAddressWrite } from "../../pickup-addresses/domain/pickup-address.repository.js";
import type { PickupDiscount } from "../../pickup-addresses/domain/pickup-discount.js";
import type { SitePlace } from "../domain/site.js";

/** Les champs postaux et horaires d'une charge de point, sans le reste. */
type PlaceFields = Omit<PickupAddressPayload, "discounts" | "gps">;

/** Le lieu d'un site, depuis une charge déjà résolue (remise validée, GPS décidé). */
export function placeOf(
  fields: PlaceFields,
  discount: PickupDiscount,
  gps: GpsPoint | null,
): SitePlace {
  return {
    label: fields.label,
    ligne1: fields.ligne1,
    ligne2: fields.ligne2,
    codePostal: fields.codePostal,
    ville: fields.ville,
    pays: fields.pays,
    opening: fields.opening,
    gps,
    discount,
  };
}

/** La charge des faits `pickup_address.created` / `updated`, inchangée depuis août. */
export function writeOf(
  fields: PlaceFields,
  discount: PickupDiscount,
  gps: GpsPoint | null,
): PickupAddressWrite {
  return { ...fields, discount, gps };
}

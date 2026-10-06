import type { DeliveryAddressPayload, DeliverySpecs } from "@lfd/contracts";

import { withSlotList } from "../services/delivery-slot-list.js";
import { deliveryStopMinutesOf } from "../value-objects/delivery-stop-minutes.js";

/**
 * Les lignes postales d'une adresse. La **forme** est déjà garantie à la
 * frontière par `postalFieldsSchema` (ligne1, code postal, ville et pays non
 * vides) : l'agrégat ne la revalide pas, il ne porte que les règles que Zod ne
 * peut pas voir — celles qui parlent du carnet, pas d'une ligne isolée.
 */
export interface PostalLines {
  readonly label: string;
  readonly ligne1: string;
  readonly ligne2: string;
  readonly codePostal: string;
  readonly ville: string;
  readonly pays: string;
}

/**
 * Les consignes à écrire : la charge, son temps de livraison sur place passé
 * par le carnet (L7b-C4). Non saisi, il n'est pas écrit — le `jsonb` garde sa
 * forme d'avant pour toutes les adresses qui suivent le réglage. Les créneaux
 * suivent {@link withSlotList} : une liste rangée survit à une charge qui
 * l'ignore.
 */
export function specsOf(
  payload: DeliveryAddressPayload,
  stored: DeliverySpecs | null,
): DeliverySpecs {
  const { stopMinutes, ...rest } = withSlotList(payload.specs, stored);
  const checked = deliveryStopMinutesOf(stopMinutes);
  return checked === null ? rest : { ...rest, stopMinutes: checked };
}

/** Les seules colonnes postales, extraites d'une charge validée. */
export function linesOf(payload: DeliveryAddressPayload): PostalLines {
  return {
    label: payload.label,
    ligne1: payload.ligne1,
    ligne2: payload.ligne2,
    codePostal: payload.codePostal,
    ville: payload.ville,
    pays: payload.pays,
  };
}

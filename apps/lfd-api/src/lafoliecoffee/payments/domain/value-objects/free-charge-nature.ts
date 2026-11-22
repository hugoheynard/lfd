import { FREE_CHARGE_NATURES, isFreeChargeNature, type FreeChargeNature } from "@lfd/contracts";

import {
  PaymentLinkNatureCorruptError,
  UnknownFreeChargeNatureError,
} from "../errors/payment-link-errors.js";

const ADMITTED = FREE_CHARGE_NATURES.map((nature) => nature.key);

/**
 * La nature choisie à la création, contre le registre `FREE_CHARGE_NATURES`.
 * La colonne n'a pas de `CHECK` : ce refus est la seule défense en écriture.
 *
 * @throws {UnknownFreeChargeNatureError} clé hors registre.
 */
export function chooseFreeChargeNature(raw: string): FreeChargeNature {
  if (!isFreeChargeNature(raw)) {
    throw new UnknownFreeChargeNatureError(raw, ADMITTED);
  }
  return raw;
}

/**
 * La nature d'une ligne relue. `null` reste `null` : une demande d'avant le
 * registre est « non précisée », on ne lui invente pas de nature.
 *
 * @throws {PaymentLinkNatureCorruptError} clé rangée hors registre.
 */
export function rehydrateFreeChargeNature(
  linkId: string,
  raw: string | null,
): FreeChargeNature | null {
  if (raw === null || isFreeChargeNature(raw)) {
    return raw;
  }
  throw new PaymentLinkNatureCorruptError(linkId, raw);
}

import {
  InvalidPreferenceSearchAddressError,
  InvalidStaffUnsubscribeAddressError,
} from "../errors/marketing-preference-admin.errors.js";

/** La longueur maximale d'une adresse, celle de `mail_request.recipient`. */
const ADDRESS_MAX = 320;

function isAddressShaped(trimmed: string): boolean {
  return trimmed.length > 0 && trimmed.length <= ADDRESS_MAX && trimmed.includes("@");
}

/**
 * **L'adresse que le staff désinscrit à la demande du client** (lot C4),
 * rognée : elle doit porter un @ et tenir dans la colonne. La normalisation
 * (minuscules) reste celle du registre (`marketingKeyOf`).
 *
 * @throws {InvalidStaffUnsubscribeAddressError} vide, sans @, ou trop longue.
 */
export function staffUnsubscribeAddressOf(address: string): string {
  const trimmed = address.trim();
  if (!isAddressShaped(trimmed)) {
    throw new InvalidStaffUnsubscribeAddressError();
  }
  return trimmed;
}

/**
 * **L'adresse que le staff cherche dans le registre** (lot C4) : la même
 * règle de forme, son propre refus.
 *
 * @throws {InvalidPreferenceSearchAddressError} vide, sans @, ou trop longue.
 */
export function preferenceSearchAddressOf(address: string): string {
  const trimmed = address.trim();
  if (!isAddressShaped(trimmed)) {
    throw new InvalidPreferenceSearchAddressError();
  }
  return trimmed;
}

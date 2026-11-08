import { recipientKeyOf } from "../../../requests/domain/entities/mail-request.js";
import { InvalidMailSearchAddressError } from "../errors/mail-sends.errors.js";

/** La longueur maximale d'une adresse, celle de `mail_request.recipient`. */
const ADDRESS_MAX = 320;

/**
 * **L'adresse cherchée, normalisée comme `recipient_key`** (décision 9) :
 * sans espaces autour, en minuscules — la règle même de l'agrégat
 * (`recipientKeyOf`), appliquée à une adresse rognée.
 *
 * @throws {InvalidMailSearchAddressError} vide, sans @, ou trop longue.
 */
export function mailSearchKeyOf(address: string): string {
  const trimmed = address.trim();
  if (trimmed.length === 0 || trimmed.length > ADDRESS_MAX || !trimmed.includes("@")) {
    throw new InvalidMailSearchAddressError();
  }
  return recipientKeyOf(trimmed);
}

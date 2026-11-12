import type { BillingAddressPayload } from "@lfd/contracts";

/** Les champs d'une adresse de facturation, tels qu'ils sont gardés. */
const BILLING_FIELDS = ["label", "ligne1", "ligne2", "codePostal", "ville", "pays"] as const;

/**
 * L'adresse de facturation saisie est-elle celle qui est déjà gardée ?
 *
 * La facturation n'a pas d'agrégat (aucune règle ne refuse son écriture) ;
 * cette comparaison est la seule décision qu'elle porte : une saisie identique
 * ne réécrit rien et ne journalise rien.
 */
export function sameBillingAddress(
  stored: BillingAddressPayload | null,
  wanted: BillingAddressPayload,
): boolean {
  return stored !== null && BILLING_FIELDS.every((field) => stored[field] === wanted[field]);
}

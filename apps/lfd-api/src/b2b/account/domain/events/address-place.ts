import type { BillingAddressPayload } from "@lfd/contracts";

/**
 * **Où** se trouve une adresse, tel que le journal l'écrit — pour le staff
 * comme pour le client : un type de fait, une forme de charge.
 *
 * Ville et code postal suffisent à reconnaître le lieu dans un historique sans
 * être une coordonnée de personne ; jamais le numéro ni la rue. Recopier la
 * fiche entière ferait du journal une seconde base, désynchronisée par
 * construction.
 */
export function placeOf(payload: BillingAddressPayload): Record<string, unknown> {
  return { ville: payload.ville, codePostal: payload.codePostal };
}

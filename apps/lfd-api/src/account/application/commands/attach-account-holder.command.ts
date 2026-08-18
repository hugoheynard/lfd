import type { ContactDetailsInput } from "../../domain/value-objects/contact-details.js";

/**
 * Rattache le **détenteur** d'un compte ouvert sans lui.
 *
 * L'autre moitié de « on ouvre avec l'enseigne seule » : le commercial note la
 * société pendant l'appel, obtient l'adresse du gérant le lendemain, et la pose
 * ici. Un seul geste couvre les deux situations — personne inconnue (identité
 * provisionnée, lien de mot de passe) ou client qui a **déjà** un espace pour
 * une autre société (la nouvelle rejoint le sien). C'est le serveur qui les
 * distingue, par l'adresse ; le commercial n'a pas à le savoir, et ne doit
 * d'ailleurs pas l'apprendre.
 *
 * Ne **remplace** pas un détenteur en place : l'agrégat refuse (cf.
 * `Company.attachHolder`). Changer de détenteur est une autre décision, qui
 * mérite son propre geste.
 *
 * `invitedBy` est le `sub` du staff : une **trace**, pas une autorisation.
 */
export class AttachAccountHolderCommand {
  constructor(
    readonly companyId: string,
    readonly contact: ContactDetailsInput,
    readonly invitedBy: string,
  ) {}
}

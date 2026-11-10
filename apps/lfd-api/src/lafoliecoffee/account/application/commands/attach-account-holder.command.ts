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
 * `invitedBy` est l'id de la fiche du staff : une **trace**, pas une autorisation.
 *
 * `intentKey` est la clé d'intention que l'écran a fabriquée à l'ouverture du
 * dialogue (en-tête `Idempotency-Key`) : un second clic de même clé ne
 * réexécute rien et rend le résultat du premier (plan
 * `plan-service-e-mails.md`, revue, cas 4).
 */
export class AttachAccountHolderCommand {
  constructor(
    readonly companyId: string,
    readonly contact: ContactDetailsInput,
    readonly invitedBy: string,
    readonly intentKey: string,
  ) {}
}

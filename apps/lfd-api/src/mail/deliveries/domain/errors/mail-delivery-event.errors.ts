import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Un retour du fournisseur qu'on ne sait pas ranger. Le webhook l'écarte
 * avant (lecture défensive) ; arriver ici dit que la lecture a laissé passer
 * une forme que la table refuserait.
 */
export class InvalidMailDeliveryEventError extends DomainError {
  constructor(field: string) {
    super(
      "MAIL_DELIVERY_EVENT_INVALID",
      `Le retour de Resend n'est pas rangé : ${field} est vide ou trop long. ` +
        "Rien n'est perdu côté demande ; vérifier la forme de l'événement chez Resend.",
    );
  }
}

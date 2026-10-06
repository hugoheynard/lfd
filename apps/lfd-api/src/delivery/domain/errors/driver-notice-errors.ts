import { BusinessError, DomainError } from "../../../platform/shared/errors/app-error.js";

/**
 * Le livreur accuse une version du texte qui n'est plus la courante : le texte
 * a changé pendant qu'il le lisait (une mise en production entre l'ouverture
 * et le clic). 409 : on ne date pas la lecture d'un texte qu'il n'a pas vu.
 */
export class DriverNoticeOutdatedError extends BusinessError {
  constructor() {
    super(
      "delivery.driver_notice_outdated",
      "Le texte « Vos données de livreur » a changé pendant votre lecture : rechargez la page pour lire la nouvelle version, puis démarrez la tournée.",
    );
  }
}

/** Un accusé sans personne : un appel mal câblé, jamais un geste du livreur. */
export class DriverNoticeWithoutStaffError extends DomainError {
  constructor() {
    super(
      "delivery.driver_notice_without_staff",
      "Un accusé de lecture doit nommer la fiche staff qui a lu : reconnectez-vous, puis recommencez.",
    );
  }
}

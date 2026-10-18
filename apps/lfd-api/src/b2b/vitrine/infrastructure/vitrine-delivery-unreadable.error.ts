import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/** Une ligne de livraison que le code ne sait pas relire : une écriture hors de l'agrégat. */
export class VitrineDeliveryUnreadableError extends TechnicalError {
  constructor(id: string) {
    super(
      "vitrine.delivery.unreadable",
      `L'envoi ${id} est illisible en base (genre, état ou changements inattendus) : il a été écrit hors de l'application. Le signaler à l'équipe technique.`,
    );
  }
}

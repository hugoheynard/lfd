import { DomainError } from "../../../platform/shared/errors/app-error.js";

/**
 * La position relevée au geste (`documentation/livraisons/gps-y-aller-et-position.md`,
 * YA-D4) est incomplète ou impossible. Le téléphone ne l'envoie jamais ainsi :
 * c'est un écran mal fait ou un appel forgé. Le geste est refusé plutôt que
 * d'écrire un point faux — le livreur le refait, la position est facultative.
 */
export class GesturePositionInvalidError extends DomainError {
  constructor() {
    super(
      "delivery.gesture_position_invalid",
      "La position envoyée avec ce geste est incomplète ou impossible (latitude entre -90 et 90, longitude entre -180 et 180, précision positive). Rechargez la page et refaites le geste : il s'enregistre aussi sans position.",
    );
  }
}

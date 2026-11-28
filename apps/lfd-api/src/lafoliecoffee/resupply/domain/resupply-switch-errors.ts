import { BusinessError } from "../../../platform/shared/errors/app-error.js";

/**
 * Le réassort est éteint : aucune écriture des routes du réassort ne passe.
 * Ce qui a déjà été envoyé reste lisible.
 */
export class ResupplyDisabledError extends BusinessError {
  constructor() {
    super(
      "resupply.disabled",
      "Le réassort est désactivé — il s'allume dans Réglages › Production › Fournil.",
    );
  }
}

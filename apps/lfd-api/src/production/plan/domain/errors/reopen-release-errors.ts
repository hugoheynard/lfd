import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * La journée a été rouverte, et le commerce n'a pas encore remis en `placed`
 * les commandes de l'arrêt défait. Arrêter maintenant les laisserait hors de
 * tout plan : l'arrêt attend la remise, qui suit la réouverture de quelques
 * instants.
 */
export class ReopenReleasePendingError extends BusinessError {
  constructor(serviceDay: string) {
    super(
      "production.day.reopen_release_pending",
      `La réouverture du ${serviceDay} est encore en cours de remise au commerce : ` +
        "réessayez dans un instant.",
    );
  }
}

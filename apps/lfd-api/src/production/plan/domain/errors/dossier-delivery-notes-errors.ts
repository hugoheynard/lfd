import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Le dossier attend ses BL.** À l'arrêt, le commerce fait naître les BL dans
 * un abonné que rien n'ordonne avant celui du dossier : tant qu'une commande
 * de la journée n'a pas le sien, le dossier ne part pas, et la livraison du
 * fait est rejouée plus tard (décidé par Hugo le 2026-11-25 : « on doit
 * toujours avoir tous les BL »).
 */
export class DossierAwaitsDeliveryNotesError extends TechnicalError {
  constructor(serviceDay: string, missing: number) {
    super(
      "production.dossier.awaits_delivery_notes",
      `Le dossier du ${serviceDay} attend encore ${String(missing)} bon(s) de livraison : il partira quand ils seront nés.`,
    );
  }
}

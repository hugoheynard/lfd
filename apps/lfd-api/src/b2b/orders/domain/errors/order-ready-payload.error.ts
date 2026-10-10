import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/** Un fait `order.ready` reçu hors de son contrat : le courriel « prête » n'est pas parti. */
export class OrderReadyPayloadError extends TechnicalError {
  constructor() {
    super(
      "order_ready.payload_invalid",
      "Le fait « commande prête » reçu est illisible (commande manquante) : le courriel « votre " +
        "commande est prête » n'est pas parti. Le message reste dans la boîte d'envoi ; corriger " +
        "l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}

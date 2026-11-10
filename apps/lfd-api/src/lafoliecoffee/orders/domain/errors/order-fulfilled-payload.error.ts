import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/** Le fait `order.fulfilled` reçu ne respecte pas son contrat. */
export class OrderFulfilledPayloadError extends TechnicalError {
  constructor() {
    super(
      "order_fulfilled.payload_invalid",
      "Le fait « commande remise » reçu est illisible (commande, client, instant, auteur ou mode manquant) : " +
        "ni les points ni le journal n'ont été écrits pour cette remise. Le message reste dans la boîte d'envoi ; " +
        "corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}

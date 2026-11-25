import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Le port offert n'a pas mis le frais à zéro** (`documentation/commandes/reliquat/reliquat.md`, § 6.6, décision 7).
 * La composition d'une commande issue d'un reliquat force le seuil du franco
 * à 0 : un frais non nul dit que le calcul a été changé sans que cette règle
 * suive. Refusé ici, avec son nom, plutôt que par le CHECK
 * `orders_delivery_offered_waives_fee` de la base en erreur 500 muette.
 */
export class OfferedDeliveryChargedError extends TechnicalError {
  constructor(feeCents: number) {
    super(
      "orders.offered_delivery.charged",
      `La livraison de cette commande est offerte, mais le calcul lui facture ${String(feeCents)} centimes de port : ` +
        "rien n'a été enregistré. Prévenir l'équipe technique.",
    );
  }
}

/** Le port offert se pose à la composition, avant que le règlement soit décidé. */
export class OfferedDeliveryTooLateError extends TechnicalError {
  constructor() {
    super(
      "orders.offered_delivery.too_late",
      "Le port offert se décide en composant la commande, avant son règlement : " +
        "rien n'a été enregistré. Prévenir l'équipe technique.",
    );
  }
}

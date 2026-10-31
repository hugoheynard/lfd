import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/** Une colonne JSON d'ajustement que la passation n'a pas pu écrire ainsi. */
export class FrozenAdjustmentUnreadableError extends TechnicalError {
  constructor(orderId: string, column: string) {
    super(
      "orders.frozen_adjustment.unreadable",
      `La règle figée « ${column} » de la commande ${orderId} est illisible : la colonne a été écrite hors de l'application. ` +
        "Le bon de livraison partiel n'a pas été recomposé ; signalez-le à l'équipe technique.",
    );
  }
}

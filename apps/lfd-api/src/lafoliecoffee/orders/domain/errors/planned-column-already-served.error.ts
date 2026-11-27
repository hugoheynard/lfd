import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Deux balayages ont composé la même colonne planifiée, et l'autre l'a
 * inscrite le premier : la commande de celui-ci s'annule avec sa transaction.
 * Jamais montré à personne — la passation le traduit en « déjà passée ».
 */
export class PlannedColumnAlreadyServedError extends BusinessError {
  constructor(columnId: string) {
    super(
      "orders.planned_column.already_served",
      `La colonne planifiée ${columnId} a déjà sa commande.`,
    );
  }
}

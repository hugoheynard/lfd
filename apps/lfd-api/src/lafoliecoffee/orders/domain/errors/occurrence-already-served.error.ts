import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Deux balayages ont composé la même échéance, et l'autre l'a inscrite le
 * premier : la commande de celui-ci s'annule avec sa transaction. Jamais
 * montré à personne — la passation d'une échéance le traduit en « déjà
 * close ».
 */
export class OccurrenceAlreadyServedError extends BusinessError {
  constructor(subscriptionId: string, date: string) {
    super(
      "orders.recurring_occurrence.already_served",
      `L'échéance du ${date} du panier ${subscriptionId} a déjà été passée.`,
    );
  }
}

import type { MailDeliveryEvent } from "../entities/mail-delivery-event.js";

/**
 * Port d'**écriture** des retours rangés (plan `plan-suivi-des-e-mails.md`,
 * décision 2). Une seule écriture : un retour ne se modifie pas.
 */
export abstract class MailDeliveryEventLog {
  /**
   * Range le retour, sauf si son `svixId` l'est déjà.
   *
   * @returns `false` pour un rejeu : rien n'est écrit, rien n'est à appliquer.
   */
  abstract addIfAbsent(event: MailDeliveryEvent): Promise<boolean>;
}

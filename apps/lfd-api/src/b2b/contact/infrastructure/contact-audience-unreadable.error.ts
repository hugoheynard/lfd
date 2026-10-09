import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/** Un message rangé avec le public `both` : l'écriture ne le permet pas, la base l'a reçu d'ailleurs. */
export class ContactAudienceUnreadableError extends TechnicalError {
  constructor(messageId: string) {
    super(
      "contact.message.audience_unreadable",
      `Le message ${messageId} porte le public « both », qu'un message ne peut pas avoir : la ligne a été écrite hors de l'application. Corriger la colonne audience en base (b2b ou b2c).`,
    );
  }
}

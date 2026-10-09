import type { ContactMessage } from "../contact-message.js";

/** Port d'**écriture** des messages : l'agrégat entier, chargé puis enregistré. */
export abstract class ContactMessageRepository {
  abstract load(id: string): Promise<ContactMessage | null>;
  /** Crée le message reçu, ou enregistre son traitement. */
  abstract save(message: ContactMessage): Promise<void>;
}

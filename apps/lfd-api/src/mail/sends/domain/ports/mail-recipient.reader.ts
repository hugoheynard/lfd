/** L'adresse en clair et la raison d'un échec : ce qu'une révélation ouvre. */
export interface RevealedMailRecipient {
  readonly recipient: string;
  readonly failureReason: string | null;
}

/**
 * Port de lecture de l'ADRESSE d'un envoi (décisions 4 et 7) : séparé de
 * {@link MailSendReader} pour que seule la requête qui a vérifié la
 * révélation en dépende.
 */
export abstract class MailRecipientReader {
  /** `null` : l'envoi n'est pas au suivi. */
  abstract recipientOf(sendId: string): Promise<RevealedMailRecipient | null>;
}

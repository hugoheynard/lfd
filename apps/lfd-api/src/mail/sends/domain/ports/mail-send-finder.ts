/** Port de la recherche des envois d'une adresse normalisée (`recipient_key`). */
export abstract class MailSendFinder {
  /** Les identifiants des demandes adressées à cette clé. */
  abstract idsByRecipientKey(recipientKey: string): Promise<readonly string[]>;
}

/**
 * Port de **lecture** : combien de réponses par e-mail une adresse a déjà
 * fait ranger depuis un instant (plan `plan-reponses-par-e-mail.md`, §2). Il
 * porte le plafond de réception et la cloche bornée.
 */
export abstract class RecentEmailRepliesReader {
  /** Les demandes `email_reply` de cette adresse (normalisée) reçues depuis `since`. */
  abstract countFromSince(email: string, since: Date): Promise<number>;
}

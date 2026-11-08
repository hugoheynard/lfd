/**
 * Port de lecture des révélations (décision 7) : la requête de l'adresse lit
 * CETTE table du bloc, pas le journal des faits.
 */
export abstract class MailRevealLedger {
  /** La dernière révélation de cet envoi par cette personne ; `null` s'il n'y en a pas. */
  abstract lastRevealedAt(staffId: string, sendId: string): Promise<Date | null>;
}

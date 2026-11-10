/** Ce qu'est devenu un mandat figé sur une ligne de lot. */
export interface MandateNow {
  readonly active: boolean;
  /** L'IBAN du compte recopié aujourd'hui, en clair ; `null` s'il n'y en a plus. */
  readonly iban: string | null;
}

/**
 * La **relecture du dépôt** : les mandats d'un lot sont-ils encore actifs, sur
 * le même compte ? Déclaré par la comptabilité, implémenté par `payments`.
 *
 * Un mandat absent de la réponse n'existe plus — le dépôt le traite comme
 * révoqué.
 */
export abstract class MandateRecheckReader {
  abstract currentOf(mandateIds: readonly string[]): Promise<ReadonlyMap<string, MandateNow>>;
}

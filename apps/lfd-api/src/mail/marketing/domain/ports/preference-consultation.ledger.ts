/** Une recherche par adresse du registre, telle qu'elle a été rangée — jamais l'adresse. */
export interface StoredPreferenceSearch {
  readonly id: string;
  readonly staffId: string;
  readonly at: Date;
  readonly preferenceIds: readonly string[];
}

/**
 * Port de LECTURE des consultations du registre (lot C4) : la requête de
 * l'adresse et celle des résultats lisent CES tables, pas le journal.
 */
export abstract class PreferenceConsultationLedger {
  /** La dernière révélation de cette ligne par cette personne ; `null` s'il n'y en a pas. */
  abstract lastRevealedAt(staffId: string, preferenceId: string): Promise<Date | null>;

  /** `null` : la recherche n'existe pas (ou plus). */
  abstract searchOf(searchId: string): Promise<StoredPreferenceSearch | null>;
}

/** Ce qu'un fichier de retours apparie d'un essai — sans IBAN. */
export interface CollectionTestReturnTarget {
  readonly testId: string;
  readonly messageId: string;
  readonly debtorName: string;
  readonly amountCents: number;
  /** Un retour lui est déjà rattaché. */
  readonly returned: boolean;
}

/**
 * Port de lecture : les essais que ces `EndToEndId` (`ESS-…`) désignent, pour
 * l'aperçu et la confirmation d'un import de retours (plan
 * `plan-prelevement-d-essai.md`, §4 « Retours »).
 */
export abstract class CollectionTestReturnTargetsReader {
  abstract byEndToEndIds(
    endToEndIds: readonly string[],
  ): Promise<ReadonlyMap<string, CollectionTestReturnTarget>>;
}

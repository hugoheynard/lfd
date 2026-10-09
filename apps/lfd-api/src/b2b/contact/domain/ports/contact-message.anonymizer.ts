/**
 * L'**anonymisation** des messages traités depuis plus que la durée de
 * conservation (`contact-retention.ts`).
 *
 * Une écriture par lot, sans agrégat, comme la purge des positions au geste :
 * il n'existe aucune règle qui puisse la refuser — la frontière est dans le
 * `where`, et un message déjà anonymisé n'est plus jamais touché.
 */
export abstract class ContactMessageAnonymizer {
  /**
   * Vide nom, e-mail, téléphone et texte d'au plus `limit` messages traités
   * avant `before` et pas encore anonymisés ; pose `anonymized_at = at`.
   * @returns le nombre de messages anonymisés.
   */
  abstract anonymizeBatchHandledBefore(before: Date, at: Date, limit: number): Promise<number>;
}

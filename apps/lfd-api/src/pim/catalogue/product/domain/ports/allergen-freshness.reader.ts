/**
 * **Le plus récent instant de mise à jour** de fiches, de leurs déclinaisons
 * et de leurs déclarations d'allergènes — ce qui date une matrice exportée.
 *
 * Ce sont les `updated_at` des lignes : la seule trace datée qui existe. Une
 * publication touche la ligne de la fiche, et c'est voulu : elle change ce
 * que la matrice montre.
 */
export abstract class AllergenFreshnessReader {
  /** `null` quand aucune ligne ne répond (liste vide comprise). */
  abstract lastModifiedAt(productIds: readonly string[]): Promise<Date | null>;
}

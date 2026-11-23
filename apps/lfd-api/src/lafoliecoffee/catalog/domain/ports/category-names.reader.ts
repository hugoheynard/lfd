/** Le nom d'aujourd'hui d'une famille du catalogue. */
export interface CategoryName {
  readonly id: string;
  readonly name: string;
}

/**
 * **Le nom des familles, par lot** — lecture publiée par le catalogue,
 * propriétaire de `catalog_categories`, pour l'export des ventes : une ligne
 * de commande garde l'identifiant de sa famille, le catalogue en dit le nom.
 * Une famille retirée garde son nom : une vente passée reste nommée.
 */
export abstract class CategoryNamesReader {
  /** Les familles connues parmi `ids` ; un identifiant inconnu est absent de la réponse. */
  abstract namesOf(ids: readonly string[]): Promise<readonly CategoryName[]>;
}

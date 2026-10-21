/**
 * Un article qu'un site peut recevoir : le SKU produit, son nom publié et sa
 * famille (tête de lignée), par laquelle le comptoir range sa table.
 */
export interface ResupplyArticle {
  readonly sku: string;
  readonly name: string;
  readonly categoryId: string;
  readonly categoryName: string;
}

/**
 * Port de **lecture** du catalogue publié, vu du réapprovisionnement : ce que
 * la boutique vend aux particuliers (la vitrine). Aucun prix : un
 * réapprovisionnement n'en porte pas.
 */
export abstract class ResupplyCatalogue {
  /** Les articles proposables, dans l'ordre du référentiel. */
  abstract articles(): Promise<readonly ResupplyArticle[]>;

  /** L'article publié sous ce SKU produit, ou `null` s'il est inconnu ou masqué. */
  abstract article(sku: string): Promise<ResupplyArticle | null>;
}

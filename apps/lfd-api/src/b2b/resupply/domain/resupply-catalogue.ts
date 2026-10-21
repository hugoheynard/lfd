/** Un article qu'un site peut recevoir : le SKU produit et son nom publié. */
export interface ResupplyArticle {
  readonly sku: string;
  readonly name: string;
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

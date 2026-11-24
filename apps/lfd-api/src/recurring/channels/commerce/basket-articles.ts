/** Ce que le catalogue dit des articles d'un panier. */
export interface BasketArticlesReview {
  /** Les SKU vendus au poids : un panier ne compte que des pièces. */
  readonly weightSold: ReadonlySet<string>;
  /** Les noms des articles vendus seulement pendant une opération datée. */
  readonly operationOnly: readonly string[];
}

/**
 * **Ce que le bloc demande du catalogue** — déclaré par les paniers
 * récurrents, implémenté par le commerce (`catalog`).
 */
export abstract class BasketArticles {
  abstract review(skus: readonly string[]): Promise<BasketArticlesReview>;

  /**
   * Refuse un article réservé à un autre compte que `companyId` (`null` :
   * perso). Le refus est une erreur métier du commerce, qui nomme l'article
   * et le geste de sortie ; le bloc la laisse remonter telle quelle.
   */
  abstract ensureOpenTo(companyId: string | null, skus: readonly string[]): Promise<void>;
}

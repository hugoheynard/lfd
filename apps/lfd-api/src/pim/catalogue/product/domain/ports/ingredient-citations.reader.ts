/** L'ingrédient tel que la propagation le nomme et le juge. */
export interface CitedIngredient {
  readonly key: string;
  /** Le nom français du jour — figé dans la trace de chaque fiche. */
  readonly name: string;
  /** Ce qu'il porte MAINTENANT : ce qu'on propage se confronte à cet état. */
  readonly allergens: readonly string[];
}

/** Une fiche qui cite l'ingrédient, et ce que citent ses AUTRES ingrédients. */
export interface CitingProduct {
  readonly productId: string;
  /** L'union des codes des autres ingrédients cités, dédupliquée et rangée. */
  readonly otherCited: readonly string[];
}

export interface IngredientCitations {
  readonly ingredient: CitedIngredient;
  readonly products: readonly CitingProduct[];
}

/**
 * **Les fiches qui citent un ingrédient**, et ce que leurs autres ingrédients
 * portent — de quoi juger qu'un allergène retiré y reste dû.
 *
 * Même montage que `CitedAllergensReader` : déclaré par le catalogue, qui
 * possède les déclarations et le jugement ; implémenté par la provenance
 * (`ingredients/`), qui possède les citations. Le catalogue ne lit pas ses
 * tables. Un port à part et non une méthode de plus sur le premier : ses
 * lecteurs (liste, activation, encart) n'en ont pas l'usage.
 */
export abstract class IngredientCitationsReader {
  /** `null` : aucun ingrédient sous cette clé. */
  abstract citationsOf(ingredientKey: string): Promise<IngredientCitations | null>;
}

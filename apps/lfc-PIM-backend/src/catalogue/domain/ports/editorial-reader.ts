/**
 * Lecture de la couche éditoriale — surface **séparée** de l'écriture
 * (`EditorialRepository`) : un consommateur qui lit ne dépend pas du `save`.
 * Les champs sont rendus en français plat (le back-office est monolingue FR) ;
 * `null` = non renseigné.
 */
export interface ProductEditorialView {
  readonly descriptionShort: string | null;
  readonly descriptionLong: string | null;
  readonly story: string | null;
  readonly pairing: string | null;
  readonly brand: string | null;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
}

export abstract class EditorialReader {
  abstract findByProduct(
    productId: string,
  ): Promise<ProductEditorialView | null>;
}

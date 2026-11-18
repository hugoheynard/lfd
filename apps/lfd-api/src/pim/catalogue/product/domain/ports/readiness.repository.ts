import type { ProductReadiness } from "../entities/product-readiness.js";

/**
 * Le port d'écriture de la mise en vente : il prend et rend l'agrégat. Les
 * lectures (`ReadinessReader`) sont un autre port.
 */
export abstract class ReadinessRepository {
  /**
   * L'agrégat d'une fiche — **toujours** rendu : sans ligne en base il est
   * non signé, ce qui est exactement « personne ne s'est prononcé ».
   */
  abstract load(productId: string): Promise<ProductReadiness>;

  /**
   * Écrit l'état de l'agrégat : une signature se pose (ou écrase la
   * précédente), l'absence de signature retire la ligne. Retirer une signature
   * déjà absente n'est pas une erreur d'infrastructure : une course entre deux
   * retraits ne doit pas finir en 500.
   */
  abstract save(readiness: ProductReadiness): Promise<void>;
}

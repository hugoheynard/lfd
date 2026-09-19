import type { ProductLineage } from "../product-lineage.js";

/**
 * Port de lecture : **ce qu'une fiche porte aujourd'hui**, résolu dans les
 * tables du référentiel.
 *
 * Un port à lui plutôt qu'une méthode de plus sur `ProductRepository` ou
 * `CatalogueReader` : il traverse familles, taux, ingrédients et révisions pour
 * un seul consommateur, l'historique, et aucun des deux autres n'a à en
 * dépendre.
 */
export abstract class ProductLineageReader {
  /** `null` = la fiche n'existe pas. */
  abstract lineageOf(productId: string): Promise<ProductLineage | null>;
}

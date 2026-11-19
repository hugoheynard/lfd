import type { Product } from "../entities/product.js";

/**
 * **Toutes les fiches, archivées et supprimées comprises, rangées par
 * référence** — la lecture que tiennent la liste des fiches, ses constats de
 * conformité, les faits et la révision du catalogue.
 *
 * Port de LECTURE, à part du dépôt (ISP) : aucun de ses appelants n'écrit.
 * Il rend l'agrégat parce que la liste et les constats jugent une fiche par
 * le code même qui accepte ou refuse son activation (`Product.complianceWith`)
 * — un jugement recopié sur l'instantané finirait par diverger.
 */
export abstract class AllProductsReader {
  abstract all(): Promise<Product[]>;
}

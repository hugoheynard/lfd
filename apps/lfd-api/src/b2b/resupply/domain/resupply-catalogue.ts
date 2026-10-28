import { WeightArticleInResupplyError } from "./resupply-receipt-errors.js";

/**
 * Un article qu'un site peut recevoir : le SKU produit, son nom publié et sa
 * famille (tête de lignée), par laquelle le comptoir range sa table.
 */
export interface ResupplyArticle {
  readonly sku: string;
  readonly name: string;
  readonly categoryId: string;
  readonly categoryName: string;
  /**
   * L'unité de vente. Un article au poids ne se réassortit pas : les quantités
   * d'un réassort sont des pièces (`plan-vente-au-poids.md`, §2 « hors de ce
   * plan ») — cf. {@link resuppliable}.
   */
  readonly saleUnit: "piece" | "weight";
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

/**
 * **L'article, s'il se réassortit** — refuse un article vendu au poids : un
 * réassort compte des pièces, et un poids y serait compté mille fois
 * (`documentation/pricing/plan-vente-au-poids.md`, §2, Hugo 2026-10-28).
 *
 * @throws {WeightArticleInResupplyError} l'article se vend au poids.
 */
export function resuppliable(article: ResupplyArticle): ResupplyArticle {
  if (article.saleUnit === "weight") {
    throw new WeightArticleInResupplyError(article.sku);
  }
  return article;
}

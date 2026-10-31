import type { CatalogViewer } from "../../../catalog/domain/catalog-viewer.js";
import type { CatalogArticle } from "../../../catalog/domain/catalogue-article.js";
import type { PriceGridArticle } from "../price-grid-row.js";

/** Un article du rayon de ce public : l'article scellé, et ce que la grille en écrit. */
export interface PriceGridShelfArticle {
  /** Scellé par le catalogue : la porte du prix ne prend que lui. */
  readonly article: CatalogArticle;
  readonly familyName: string;
  readonly productName: string | null;
  readonly vatRate: number;
  readonly enteredPerKg: PriceGridArticle["enteredPerKg"];
}

/** Le rayon d'un public. Son assiette et son acheteur viennent du contexte, pas d'ici. */
export interface PriceGridShelf {
  readonly articles: readonly PriceGridShelfArticle[];
}

/**
 * **Ce que ce public trouve en rayon** (`plan-export-grille-de-prix.md`, § 3) :
 * une ligne par déclinaison vendue — la règle même de la vitrine, opérations
 * datées comprises, jugées à `at`.
 *
 * Un port de lecture, et lui seul : l'export ne fait rien d'autre du catalogue.
 */
export abstract class PriceGridShelfReader {
  /**
   * @param viewer le lecteur du public (§ 8.3) : `PUBLIC_VIEWER`, le pro
   *   anonyme pour un pro type, ou celui d'une société précise.
   */
  abstract shelfFor(viewer: CatalogViewer, at: Date): Promise<PriceGridShelf>;
}

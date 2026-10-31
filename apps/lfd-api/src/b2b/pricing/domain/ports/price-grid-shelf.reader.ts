import type { CatalogArticle } from "../../../catalog/domain/catalogue-article.js";
import type { PriceGridArticle, PriceGridBasis } from "../price-grid-row.js";

/** Un article du rayon de ce public : l'article scellé, et ce que la grille en écrit. */
export interface PriceGridShelfArticle {
  /** Scellé par le catalogue : la porte du prix ne prend que lui. */
  readonly article: CatalogArticle;
  readonly familyName: string;
  readonly productName: string | null;
  readonly vatRate: number;
  readonly enteredPerKg: PriceGridArticle["enteredPerKg"];
}

/** Le rayon d'un public, et qui le tarificateur doit connaître. */
export interface PriceGridShelf {
  readonly basis: PriceGridBasis;
  /** La société dont la porte lit le tarif ; `null` = servie sans rien de négocié. */
  readonly pricingCompanyId: string | null;
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
  /** @param companyId `null` = un particulier ; sinon la société choisie. */
  abstract shelfFor(companyId: string | null, at: Date): Promise<PriceGridShelf>;
}

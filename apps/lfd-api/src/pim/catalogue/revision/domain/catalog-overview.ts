import { CategoryNotFoundError } from "../../category/domain/errors/category-errors.js";
import { isLiveStatus } from "../../product/domain/entities/product.js";
import type { OverviewProductRow } from "./ports/catalog-overview.reader.js";

/** Les comptes de la vue d'ensemble. */
export interface CatalogOverviewCounts {
  readonly products: number;
  readonly published: number;
  readonly drafts: number;
  readonly signed: number;
  readonly articles: number;
}

/**
 * La règle du compte, la même que celle de l'ancre d'une révision :
 *
 * - seules les fiches vivantes (`isLiveStatus`) comptent ;
 * - par FICHE et non par article, et une fiche sans déclinaison ne compte pas
 *   (l'ancre n'en aurait aucun article) ;
 * - les déclinaisons arrêtées sont des articles ;
 * - une fiche vivante rattachée à une famille inconnue lève
 *   `CategoryNotFoundError`, comme la résolution des taux de l'ancre.
 */
export function countCatalogOverview(rows: readonly OverviewProductRow[]): CatalogOverviewCounts {
  const live = rows.filter((row) => isLiveStatus(row.status));
  const broken = live.find((row) => !row.categoryKnown);
  if (broken !== undefined) {
    throw new CategoryNotFoundError(broken.categoryId);
  }
  const counted = live.filter((row) => row.articles > 0);
  const published = counted.filter((row) => row.status === "published").length;
  return {
    products: counted.length,
    published,
    drafts: counted.length - published,
    signed: counted.filter((row) => row.signed).length,
    articles: counted.reduce((sum, row) => sum + row.articles, 0),
  };
}

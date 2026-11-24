import type { ResupplyArticleView } from '@lfd/contracts';

import {
  ALL_FAMILIES,
  type FamilyShelves,
  SHELF_NAV_LABELS,
} from '../../commandes/nouvelle-commande/catalog-shelf-filter';
import {
  ALL_FAMILIES as NO_FAMILY_FILTER,
  articlesMatching,
} from '../../production/reassorts-a-produire/bakehouse-resupply-card/article-filters';

/** La pastille « Tout » du rail — la même que celle de la saisie de commande. */
export const ALL_SHELVES = ALL_FAMILIES;

/**
 * **Les rayons du réassort, à plat** : « Tout », puis une pastille par famille,
 * dans l'ordre du catalogue du réassort. Un article n'y porte que sa famille
 * (`categoryId`), sans ses parentes : le rail ne plonge donc pas, il reste le
 * rail plat de la saisie.
 */
export function resupplyShelvesOf(articles: readonly ResupplyArticleView[]): FamilyShelves {
  const families = new Map<string, string>();
  for (const article of articles) {
    if (!families.has(article.categoryId)) {
      families.set(article.categoryId, article.categoryName);
    }
  }
  return {
    entries: [
      { id: ALL_SHELVES, label: SHELF_NAV_LABELS.all },
      ...[...families].map(([id, label]) => ({ id, label })),
    ],
    families: new Set(families.keys()),
  };
}

/** Les articles du rayon choisi et de la recherche, dans l'ordre du catalogue. */
export function articlesOnShelf(
  articles: readonly ResupplyArticleView[],
  shelf: string,
  query: string,
): readonly ResupplyArticleView[] {
  return articlesMatching(articles, shelf === ALL_SHELVES ? NO_FAMILY_FILTER : shelf, query);
}

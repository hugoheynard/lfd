import { shelfTreeOf, UNKNOWN_FAMILY_LABEL } from '@lfd/b2b-ui/catalog';
import { searchProducts } from '@lfd/b2b-ui/search';
import type { ResupplyArticleView } from '@lfd/contracts';

import {
  ALL_FAMILIES,
  familyShelvesOf,
  type FamilyShelves,
  inChosenShelf,
  SHELF_NAV_LABELS,
  shelfIdOf,
} from '../../commandes/nouvelle-commande/catalog-shelf-filter';
import { RESUPPLY_ARTICLE_SEARCH } from '../../production/reassorts-a-produire/bakehouse-resupply-card/article-filters';

/** La pastille « Tout » du rail — la même que celle de la saisie de commande. */
export const ALL_SHELVES = ALL_FAMILIES;

/**
 * **Les rayons du réassort, en arbre**, comme ceux de la saisie de commande
 * (décidé avec Hugo le 2026-11-24) : chaque article porte sa famille et ses
 * parentes, et une parente sans article à elle entre dans l'arbre par là.
 */
export function resupplyShelvesOf(articles: readonly ResupplyArticleView[]): FamilyShelves {
  return familyShelvesOf(articles, SHELF_NAV_LABELS.all, UNKNOWN_FAMILY_LABEL);
}

/** Le rayon d'un article, tel que le rail le compte. */
export function resupplyShelfIdOf(article: ResupplyArticleView): string {
  return shelfIdOf(article);
}

/**
 * Les articles du rayon choisi — le sous-arbre d'une parente —, puis la
 * recherche de produits commune : dans l'ordre du catalogue sans requête, les
 * plus proches en tête avec.
 */
export function articlesOnShelf(
  articles: readonly ResupplyArticleView[],
  shelf: string,
  query: string,
): readonly ResupplyArticleView[] {
  const tree = shelfTreeOf(resupplyShelvesOf(articles).entries);
  return searchProducts(
    articles.filter((article) => inChosenShelf(tree, article, shelf)),
    query,
    RESUPPLY_ARTICLE_SEARCH,
  );
}

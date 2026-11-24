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
  type ShelvedItem,
} from '../../commandes/nouvelle-commande/catalog-shelf-filter';
import { RESUPPLY_ARTICLE_SEARCH } from '../../production/reassorts-a-produire/bakehouse-resupply-card/article-filters';

/** La pastille « Tout » du rail — la même que celle de la saisie de commande. */
export const ALL_SHELVES = ALL_FAMILIES;

/**
 * **Les rayons du réassort, en arbre**, comme ceux de la saisie de commande
 * (décidé avec Hugo le 2026-11-24) : chaque article porte sa famille et ses
 * parentes, et une parente sans article à elle entre dans l'arbre par là.
 * Partagés par les trois écrans du réassort : la table du comptoir, la carte
 * du fournil et la page d'un modèle.
 */
export function resupplyShelvesOf(items: readonly ShelvedItem[]): FamilyShelves {
  return familyShelvesOf(items, SHELF_NAV_LABELS.all, UNKNOWN_FAMILY_LABEL);
}

/** Le rayon d'un article (ou d'une ligne), tel que le rail le compte. */
export function resupplyShelfIdOf(item: ShelvedItem): string {
  return shelfIdOf(item);
}

/** Les éléments du rayon choisi — le sous-arbre d'une parente —, dans leur ordre. */
export function onShelf<T extends ShelvedItem>(items: readonly T[], shelf: string): readonly T[] {
  if (shelf === ALL_SHELVES) {
    return items;
  }
  const tree = shelfTreeOf(resupplyShelvesOf(items).entries);
  return items.filter((item) => inChosenShelf(tree, item, shelf));
}

/**
 * Les articles du rayon choisi, puis la recherche de produits commune : dans
 * l'ordre du catalogue sans requête, les plus proches en tête avec.
 */
export function articlesOnShelf(
  articles: readonly ResupplyArticleView[],
  shelf: string,
  query: string,
): readonly ResupplyArticleView[] {
  return searchProducts(onShelf(articles, shelf), query, RESUPPLY_ARTICLE_SEARCH);
}

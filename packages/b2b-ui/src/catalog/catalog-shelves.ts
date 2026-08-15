import {
  CATALOG_CATEGORY_LABELS,
  CATALOG_CATEGORY_ORDER,
  type CatalogCategory,
} from '@lfd/contracts';

/** Un rayon : son libellé, et ce qu'il contient. */
export interface CatalogShelf<T> {
  readonly category: CatalogCategory;
  readonly label: string;
  readonly items: readonly T[];
}

/**
 * Range des articles **par rayon, dans l'ordre de la vitrine** — celui du
 * contrat, pas l'alphabet.
 *
 * Une fonction et non un composant : les deux fronts affichent ces rayons
 * différemment (grille de cartes chez le client, liste dense au back-office),
 * mais ils les composent pareil. C'est le groupement qui se partage, pas la mise
 * en page.
 *
 * **Un rayon vide disparaît.** Après une recherche, un en-tête sans article
 * laisse croire que le filtre a échoué alors qu'il a simplement tout écarté.
 */
export function catalogShelves<T>(
  items: readonly T[],
  categoryOf: (item: T) => CatalogCategory,
): readonly CatalogShelf<T>[] {
  return CATALOG_CATEGORY_ORDER.map((category) => ({
    category,
    label: CATALOG_CATEGORY_LABELS[category],
    items: items.filter((item) => categoryOf(item) === category),
  })).filter((shelf) => shelf.items.length > 0);
}

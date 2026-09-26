import {
  CATALOG_CATEGORY_LABELS,
  CATALOG_CATEGORY_ORDER,
  type CatalogCategory,
} from '@lfd/contracts';

/** Un rayon : son libellé, et ce qu'il contient. */
export interface CatalogShelf<T> {
  /** `null` : le rayon des articles dont la famille n'est pas connue. */
  readonly category: CatalogCategory | null;
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
 *
 * **Un article sans famille connue** (`null`, panne du 2026-09-26) ferme la
 * marche sous son propre titre : il reste commandable, et il n'est pas rangé
 * dans un rayon deviné.
 */
export function catalogShelves<T>(
  items: readonly T[],
  categoryOf: (item: T) => CatalogCategory | null,
): readonly CatalogShelf<T>[] {
  const known: CatalogShelf<T>[] = CATALOG_CATEGORY_ORDER.map((category) => ({
    category,
    label: CATALOG_CATEGORY_LABELS[category],
    items: items.filter((item) => categoryOf(item) === category),
  }));
  const unknown: CatalogShelf<T> = {
    category: null,
    label: UNKNOWN_FAMILY_LABEL,
    items: items.filter((item) => categoryOf(item) === null),
  };
  return [...known, unknown].filter((shelf) => shelf.items.length > 0);
}

/** Le titre du rayon des articles dont la famille n'est pas connue. */
export const UNKNOWN_FAMILY_LABEL = 'Sans famille connue';

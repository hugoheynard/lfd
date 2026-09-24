import type { StorefrontCatalogView } from '@lfd/contracts';
import type { ShelfKey } from '@lfd/storefront-layout';

/** Le rayon « Tout » — la clé que le serveur réserve (`b2b/storefront/domain/shelf-key.ts`). */
export const ALL_SHELVES: ShelfKey = 'all';

export interface ShelfOption {
  readonly key: ShelfKey;
  readonly label: string;
}

/** Un article qu'un contenu produit peut désigner. */
export interface CatalogProduct {
  /** Le SKU du PRODUIT — celui que la boutique sert et résout (`ShopItemView.sku`). */
  readonly sku: string;
  readonly name: string;
  readonly shelf: ShelfKey;
}

/** Ce que l'éditeur lit du catalogue : les rayons servis, et les articles en vente. */
export interface StorefrontCatalog {
  /** « Tout » en tête, puis les familles dans l'ordre du catalogue. */
  readonly shelves: readonly ShelfOption[];
  readonly products: readonly CatalogProduct[];
}

/**
 * Le catalogue de l'éditeur, tel que `GET /admin/storefront/catalog` le rend.
 *
 * Le serveur a déjà réduit le catalogue à ce que la vitrine désigne — SKU du
 * PRODUIT, une fois par produit ; familles qui portent un article servi, dans
 * l'ordre du catalogue (`b2b/storefront/infrastructure/
 * catalog-backed-storefront-catalog.reader.ts`, 2026-09-24). Il ne reste ici
 * qu'à poser « Tout » en tête et à écarter les articles masqués des deux
 * boutiques : aucune ne les résoudra, et leur case retomberait au reste du
 * rayon (D4).
 */
export function catalogOf(view: StorefrontCatalogView): StorefrontCatalog {
  return {
    shelves: [
      { key: ALL_SHELVES, label: 'Tout' },
      ...view.shelves.map((shelf) => ({ key: shelf.key, label: shelf.name })),
    ],
    products: view.items
      .filter((item) => item.served)
      .map((item) => ({ sku: item.sku, name: item.name, shelf: item.shelfKey })),
  };
}

/** Le nom d'un rayon ; sa clé brute s'il n'est plus une famille servie. */
export function shelfLabelIn(shelves: readonly ShelfOption[], key: ShelfKey): string {
  return shelves.find((shelf) => shelf.key === key)?.label ?? key;
}

/**
 * Les rayons DISPARUS : visés par une page ou un objet, mais qui ne sont plus
 * une famille servie. La boutique ne les sert plus ; l'éditeur les liste à
 * vider (D4). Dans l'ordre de première apparition.
 */
export function vanishedShelves(
  keys: readonly ShelfKey[],
  shelves: readonly ShelfOption[],
): readonly ShelfKey[] {
  const known = new Set(shelves.map((shelf) => shelf.key));
  return [...new Set(keys)].filter((key) => !known.has(key));
}

/** Filtre les articles par nom ou par SKU, sans casse ni accents. */
export function searchProducts(
  products: readonly CatalogProduct[],
  query: string,
): readonly CatalogProduct[] {
  const needle = fold(query);
  return needle === ''
    ? products
    : products.filter(
        (product) => fold(product.name).includes(needle) || fold(product.sku).includes(needle),
      );
}

function fold(text: string): string {
  return text.trim().normalize('NFD').replace(/[̀-ͯ]/gu, '').toLocaleLowerCase('fr');
}

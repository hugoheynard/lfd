import type { CatalogAdminItemView } from '@lfd/contracts';
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
 * Un article est-il en vente quelque part ? Masqué des DEUX boutiques, non :
 * aucune ne le résoudra, et sa case retomberait au reste du rayon (D4).
 */
function isServed(item: CatalogAdminItemView): boolean {
  return !(item.isHidden && item.isHiddenPublic);
}

/**
 * Le catalogue d'administration réduit à ce que la vitrine désigne.
 *
 * - **le SKU du produit**, jamais celui de la déclinaison : c'est lui que la
 *   boutique sert (`shop-catalogue-view.ts` rend `item.productSku`, lu le
 *   2026-09-24). Un produit à plusieurs déclinaisons ne paraît qu'une fois,
 *   sous le nom de la première ligne rencontrée ;
 * - **les familles servies** : celles qui portent au moins un article en
 *   vente, dans l'ordre où le catalogue les rend.
 */
export function catalogOf(items: readonly CatalogAdminItemView[]): StorefrontCatalog {
  const products = new Map<string, CatalogProduct>();
  const families = new Map<ShelfKey, string>();
  for (const item of items) {
    if (!isServed(item)) {
      continue;
    }
    if (!products.has(item.productSku)) {
      products.set(item.productSku, {
        sku: item.productSku,
        name: item.name,
        shelf: item.categoryId,
      });
    }
    if (!families.has(item.categoryId)) {
      families.set(item.categoryId, item.categoryName);
    }
  }
  return {
    shelves: [
      { key: ALL_SHELVES, label: 'Tout' },
      ...[...families].map(([key, label]) => ({ key, label })),
    ],
    products: [...products.values()],
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

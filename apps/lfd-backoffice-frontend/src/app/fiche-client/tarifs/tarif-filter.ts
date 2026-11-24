import { searchProducts, type ProductSearchKeys } from '@lfd/b2b-ui/search';
import type { TarifRow, TarifShelf } from './tarif-shelves';

/** « Toutes les familles » : aucune famille retenue. */
export const ALL_SHELVES = 'all';

/** Ce que le staff a réglé au-dessus de la table. État local, rien côté serveur. */
export interface TarifFilter {
  /** L'identifiant d'une famille, ou `ALL_SHELVES`. */
  readonly shelfId: string;
  /** Recherche libre sur le nom ou le SKU. */
  readonly search: string;
  /** Ne garder que les articles dont le prix ferme est saisi. */
  readonly pricedOnly: boolean;
}

/** Une ligne de la table unique : l'article, et la famille qui le range. */
export interface FilteredTarifRow extends TarifRow {
  readonly shelfName: string;
}

/** Un article du tarif se cherche par son nom et son SKU (`searchProducts`). */
export const TARIF_ROW_SEARCH: ProductSearchKeys<{ readonly name: string; readonly sku: string }> =
  {
    nameOf: (row) => row.name,
    skuOf: (row) => row.sku,
  };

/**
 * Les lignes de la table unique, dans l'ordre du catalogue (famille puis
 * article) : le filtre retire des lignes, il ne les réordonne jamais. La
 * recherche de produits commune ne sert donc qu'à DIRE qui reste, pas à ranger.
 */
export function filterTarifRows(
  shelves: readonly TarifShelf[],
  filter: TarifFilter,
): readonly FilteredTarifRow[] {
  return shelves
    .filter((shelf) => filter.shelfId === ALL_SHELVES || shelf.id === filter.shelfId)
    .flatMap((shelf) => {
      const kept = shelf.rows.filter((row) => !filter.pricedOnly || row.priceEuros !== null);
      const found = new Set(searchProducts(kept, filter.search, TARIF_ROW_SEARCH));
      return kept.filter((row) => found.has(row)).map((row) => ({ ...row, shelfName: shelf.name }));
    });
}

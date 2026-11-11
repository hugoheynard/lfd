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

/** Casse et accents retirés : « Éclair » se trouve en tapant « eclair ». */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Les lignes de la table unique, dans l'ordre du catalogue (famille puis
 * article) : le filtre retire des lignes, il ne les réordonne jamais.
 */
export function filterTarifRows(
  shelves: readonly TarifShelf[],
  filter: TarifFilter,
): readonly FilteredTarifRow[] {
  const needle = normalizeSearch(filter.search);
  return shelves
    .filter((shelf) => filter.shelfId === ALL_SHELVES || shelf.id === filter.shelfId)
    .flatMap((shelf) =>
      shelf.rows
        .filter((row) => !filter.pricedOnly || row.priceEuros !== null)
        .filter(
          (row) =>
            needle === '' ||
            normalizeSearch(row.name).includes(needle) ||
            normalizeSearch(row.sku).includes(needle),
        )
        .map((row) => ({ ...row, shelfName: shelf.name })),
    );
}

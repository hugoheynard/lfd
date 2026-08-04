import type { FoldViewToggleOption } from 'fold-ng';

/** How the catalogue renders its products: rich cards, or a dense order-pad table. */
export type CatalogueView = 'cards' | 'table';

/** Segments for the card ↔ table view toggle (fold-view-toggle). */
export const CATALOGUE_VIEW_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'cards', icon: 'grid', label: 'Cartes' },
  { value: 'table', icon: 'list', label: 'Tableau' },
];

/** Narrows a raw toggle value back to the `CatalogueView` union. */
export function toCatalogueView(value: string): CatalogueView {
  return value === 'table' ? 'table' : 'cards';
}

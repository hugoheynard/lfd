import type { FoldTableColumn, FoldViewToggleOption } from 'fold-ng';

import { dynamicFloorLabel, floorLabel } from '../../b2b/tarification/pricing-format';
import {
  SOURCE_LABELS,
  type ArticleLimitRow,
  type CoverageFilter,
  type ScopeLimitRow,
} from './limit-coverage';

// La forme des tables de la vue — segments, filtre, colonnes.

export const CLIENTELES: readonly FoldViewToggleOption[] = [
  { value: 'pro', label: 'Pro' },
  { value: 'public', label: 'Public' },
];

export const FILTERS: readonly { readonly value: CoverageFilter; readonly label: string }[] = [
  { value: 'all', label: 'Tous les articles' },
  { value: 'none', label: 'Sans limite' },
  { value: 'to-cover', label: 'À couvrir' },
];

export const SCOPE_COLUMNS: readonly FoldTableColumn<ScopeLimitRow>[] = [
  { key: 'scope', label: 'Portée' },
  { key: 'limit', label: 'Limite qui s’applique' },
  { key: 'door', label: 'Porte dynamique' },
  { key: 'state', label: 'État' },
];

export const ARTICLE_COLUMNS: readonly FoldTableColumn<ArticleLimitRow>[] = [
  { key: 'article', label: 'Article' },
  { key: 'price', label: 'Tarif', width: '7rem' },
  { key: 'limit', label: 'Limite qui s’applique' },
  { key: 'door', label: 'Porte dynamique' },
  { key: 'state', label: 'État' },
];

/** Une ligne de la vue : une portée large, ou un article. */
export type LimitRow = ScopeLimitRow | ArticleLimitRow;

// Le contexte d'un `foldCell` n'est pas typé : la page lit ses cellules par
// ces fonctions, qui rendent le texte à partir d'une ligne typée.

export function appliedLabel(row: LimitRow): string {
  return row.applied === null ? '—' : floorLabel(row.applied);
}

export function sourceLabel(row: LimitRow): string {
  return row.source === null ? 'aucune limite' : SOURCE_LABELS[row.source];
}

export function doorOf(row: LimitRow): string | null {
  return row.applied === null ? null : dynamicFloorLabel(row.applied);
}

export function isStale(row: LimitRow): boolean {
  return row.applied?.drift?.stale === true;
}

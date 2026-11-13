import type { FoldTableColumn } from 'fold-ng';

import type { CacheFallbackCount, CacheFallbackReason, SharedCacheSeries } from '@lfd/ops-contract';

import { bytesLabel } from '../cache-chart';

const rate = (value: number | null): string =>
  value === null ? '—' : `${(value * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;

/**
 * Les colonnes du tableau par cache. La taille rangée est celle que l'objet
 * garde — compressée pour les contenus ; « en clair » est la même avant
 * compression, inconnue (—) pour les rayons et les numéros.
 */
export const CACHE_COLUMNS: readonly FoldTableColumn<SharedCacheSeries>[] = [
  { key: 'cache', label: 'Cache', value: (row) => row.cache },
  { key: 'object', label: 'Objet', value: (row) => row.object },
  {
    key: 'rateHour',
    label: 'Réussite (heure)',
    numeric: true,
    value: (row) => rate(row.lastHour.hitRate),
  },
  {
    key: 'rateDay',
    label: 'Réussite (24 h)',
    numeric: true,
    value: (row) => rate(row.last24h.hitRate),
  },
  {
    key: 'hits',
    label: 'Lectures évitées (24 h)',
    numeric: true,
    value: (row) => row.last24h.hits,
  },
  { key: 'misses', label: 'Relectures (24 h)', numeric: true, value: (row) => row.last24h.misses },
  { key: 'stores', label: 'Rangements (24 h)', numeric: true, value: (row) => row.last24h.stores },
  {
    key: 'tooLarge',
    label: 'Refusés, trop gros',
    numeric: true,
    value: (row) => row.last24h.tooLarge,
  },
  {
    key: 'tooOld',
    label: 'Refusés, journée trop vieille',
    numeric: true,
    value: (row) => row.last24h.tooOld,
  },
  {
    key: 'bytes',
    label: 'Taille rangée',
    numeric: true,
    value: (row) => bytesLabel(row.last24h.bytes),
  },
  {
    key: 'rawBytes',
    label: 'En clair',
    numeric: true,
    value: (row) => bytesLabel(row.last24h.rawBytes),
  },
  { key: 'entries', label: 'Entrées', numeric: true, value: (row) => row.last24h.entries ?? '—' },
  {
    key: 'persons',
    label: 'Personnes servies',
    numeric: true,
    value: (row) => row.last24h.persons,
  },
];

/** Une raison de repli, en français : l'identifiant du contrat ne se lit pas. */
export const FALLBACK_REASON_LABEL: Readonly<Record<CacheFallbackReason, string>> = {
  timeout: 'Délai dépassé',
  error: 'En erreur',
  unreadable: 'Illisible',
  breaker_open: 'Disjoncteur ouvert',
};

const reasonColumn = (reason: CacheFallbackReason): FoldTableColumn<CacheFallbackCount> => ({
  key: reason,
  label: FALLBACK_REASON_LABEL[reason],
  numeric: true,
  value: (row) => row.reasons[reason] ?? 0,
});

/** Les replis d'une instance, par magasin : le total, chaque raison, et le disjoncteur. */
export const FALLBACK_COLUMNS: readonly FoldTableColumn<CacheFallbackCount>[] = [
  { key: 'store', label: 'Cache', value: (row) => row.store },
  { key: 'count', label: 'Replis', numeric: true, value: (row) => row.count },
  reasonColumn('timeout'),
  reasonColumn('error'),
  reasonColumn('unreadable'),
  reasonColumn('breaker_open'),
  {
    key: 'breakerOpenings',
    label: 'Ouvertures du disjoncteur',
    numeric: true,
    value: (row) => row.breakerOpenings,
  },
];

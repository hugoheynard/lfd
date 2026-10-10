import type { LibraryMediaView, MediaLibrarySort } from '@lfd/pim-contracts';

import { seriesLabel } from './media-series';

/** Une rangée de la grille : un intercalaire (mois ou série), ou une image. */
export type FeedRow =
  | { readonly kind: 'divider'; readonly key: string; readonly label: string }
  | { readonly kind: 'image'; readonly key: string; readonly item: LibraryMediaView };

/**
 * L'heure de PARIS, et pas celle du poste : une image déposée le 31 octobre à
 * 23 h 30 à Paris est d'octobre, même lue depuis un navigateur réglé en UTC
 * où il serait déjà… le 31 à 22 h 30 — et l'inverse au 1er du mois.
 */
const MONTH_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
});
const MONTH_LABEL = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: 'long',
});

function monthOf(depositedAt: string): { key: string; label: string } {
  const at = new Date(depositedAt);
  const label = MONTH_LABEL.format(at);
  return {
    key: `month:${MONTH_KEY.format(at)}`,
    label: label.charAt(0).toLocaleUpperCase('fr-FR') + label.slice(1),
  };
}

/** L'intercalaire d'une image sous le tri par prise de vue : sa série. */
function seriesOf(item: LibraryMediaView): { key: string; label: string } {
  const series = item.series;
  return series === null
    ? { key: 'series:none', label: 'Sans série' }
    : { key: `series:${series.id}`, label: seriesLabel(series) };
}

/** Ce qui regroupe, selon l'ordre — `null` : rien ne regroupe. */
function grouping(
  sort: MediaLibrarySort,
): ((item: LibraryMediaView) => { key: string; label: string }) | null {
  if (sort === 'deposited') {
    return (item) => monthOf(item.depositedAt);
  }
  return sort === 'shot' ? seriesOf : null;
}

/**
 * La grille telle qu'elle s'affiche : les images, et un intercalaire chaque
 * fois que le groupe change.
 *
 * - Tri par DÉPÔT : le mois de dépôt, à l'heure de Paris.
 * - Tri par PRISE DE VUE : la série (titre · mois), puis « Sans série » —
 *   le serveur range les images sans série ou sans date en dernier (L3).
 *
 * Sous un autre ordre, deux images du même groupe ne se suivent pas, et
 * l'intercalaire se répéterait. Jamais par tag (D4, Hugo 2026-10-10) : une
 * image à trois tags paraîtrait trois fois.
 *
 * ⚠️ Deux séries sans date se suivent sous « prise de vue » : la clé est
 * l'IDENTIFIANT, pas le titre, pour que deux séries homonymes ne se fondent
 * pas sous un seul intercalaire.
 */
export function feedRows(
  items: readonly LibraryMediaView[],
  sort: MediaLibrarySort,
): readonly FeedRow[] {
  const groupOf = grouping(sort);
  if (groupOf === null) {
    return items.map((item): FeedRow => ({ kind: 'image', key: item.url, item }));
  }
  const rows: FeedRow[] = [];
  let current = '';
  for (const item of items) {
    const group = groupOf(item);
    if (group.key !== current) {
      current = group.key;
      rows.push({ kind: 'divider', key: group.key, label: group.label });
    }
    rows.push({ kind: 'image', key: item.url, item });
  }
  return rows;
}

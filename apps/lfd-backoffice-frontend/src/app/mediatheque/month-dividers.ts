import type { LibraryMediaView, MediaLibrarySort } from '@lfd/pim-contracts';

/** Une rangée de la grille : un intercalaire de mois, ou une image. */
export type FeedRow =
  | { readonly kind: 'month'; readonly key: string; readonly label: string }
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

/**
 * La grille telle qu'elle s'affiche : les images, et un en-tête de mois
 * chaque fois que le mois de dépôt change.
 *
 * Seulement quand le tri est PAR DÉPÔT : sous un autre ordre, deux images du
 * même mois ne se suivent pas, et l'intercalaire se répéterait. Jamais par tag
 * (D4, Hugo 2026-10-10) : une image à trois tags paraîtrait trois fois.
 */
export function feedRows(
  items: readonly LibraryMediaView[],
  sort: MediaLibrarySort,
): readonly FeedRow[] {
  const images = items.map((item): FeedRow => ({ kind: 'image', key: item.url, item }));
  if (sort !== 'deposited') {
    return images;
  }
  const rows: FeedRow[] = [];
  let current = '';
  for (const item of items) {
    const month = monthOf(item.depositedAt);
    if (month.key !== current) {
      current = month.key;
      rows.push({ kind: 'month', key: month.key, label: month.label });
    }
    rows.push({ kind: 'image', key: item.url, item });
  }
  return rows;
}

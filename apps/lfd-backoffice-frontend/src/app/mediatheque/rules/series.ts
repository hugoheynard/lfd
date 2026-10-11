import type { MediaSeriesRefView, MediaSeriesView } from '@lfd/pim-contracts';
import type { FoldSelectOption } from 'fold-ng';

import { civilDayLabel, civilMonthLabel } from './paris-calendar';

/** Les plafonds d'une série — ceux que le domaine du serveur applique (`MediaSeries`). */
export const SERIES_LIMITS = { title: 120, note: 2000 } as const;

/**
 * « Aucune » dans une liste de séries — une série n'a jamais un identifiant
 * vide, donc la valeur ne peut pas en désigner une.
 */
export const NO_SERIES = '';

/** « mars 2026 » — la date courte d'une pastille. `null` : jour inconnu. */
export function seriesMonth(shotOn: string | null): string | null {
  return shotOn === null ? null : civilMonthLabel(shotOn);
}

/** « 12 mars 2026 » — la date d'une ligne de liste. */
export function seriesDay(shotOn: string | null): string | null {
  return shotOn === null ? null : civilDayLabel(shotOn);
}

/** « Shooting carte 2026 · mars 2026 », ou le titre seul faute de date. */
export function seriesLabel(series: {
  readonly title: string;
  readonly shotOn: string | null;
}): string {
  const month = seriesMonth(series.shotOn);
  return month === null ? series.title : `${series.title} · ${month}`;
}

/** La référence qu'une image porte, tirée d'une série de la liste ; `null` sans série. */
export function seriesRefOf(series: MediaSeriesView | null | undefined): MediaSeriesRefView | null {
  if (series === null || series === undefined) {
    return null;
  }
  return { id: series.id, title: series.title, shotOn: series.shotOn };
}

/** Le choix d'une série : « Aucune série » d'abord, puis chacune par son libellé. */
export function seriesOptions(
  series: readonly MediaSeriesView[],
): readonly FoldSelectOption<string>[] {
  return [
    { value: NO_SERIES, label: 'Aucune série' },
    ...series.map((entry) => ({ value: entry.id, label: seriesLabel(entry) })),
  ];
}

/** L'identifiant choisi, ou `null` pour « Aucune série ». */
export function chosenSeriesId(value: string): string | null {
  return value === NO_SERIES ? null : value;
}

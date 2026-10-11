import type { MediaPaletteStripView, PaletteStripColumnView } from '@lfd/pim-contracts';

import { photosWording } from './media-wording';
import { parisDayLabel, parisDayOf } from './paris-calendar';

/**
 * **La frise des couleurs, en mots et en colonnes** (`mediatheque.md` §9 bis)
 * — ce que dit une colonne, combien en tiennent, laquelle est sous le
 * pointeur.
 */

/** La largeur minimale d'une colonne, en px CSS : en deçà, elle ne se lit plus. */
export const MIN_COLUMN_PX = 3;

/** Une plage de jours de Paris, `AAAA-MM-JJ`, bornes incluses. */
export interface StripRange {
  readonly from: string;
  readonly to: string;
}

/** La plage d'une colonne en jours de Paris. */
export function rangeOf(column: PaletteStripColumnView): StripRange {
  return {
    from: parisDayOf(column.from),
    to: parisDayOf(column.to),
  };
}

/** « 3 octobre 2026 · 1 photo », ou « 3 octobre 2026 – 9 octobre 2026 · 12 photos ». */
export function columnLabel(column: PaletteStripColumnView): string {
  const range = rangeOf(column);
  const from = parisDayLabel(column.from);
  const dates = range.from === range.to ? from : `${from} – ${parisDayLabel(column.to)}`;
  return `${dates} · ${photosWording(column.count)}`;
}

/** Combien de colonnes tiennent dans une largeur. */
export function columnsFor(width: number): number {
  return Math.max(1, Math.floor(width / MIN_COLUMN_PX));
}

/** La colonne sous un point de la frise ; `null` sur une frise vide ou sans largeur. */
export function columnAt(offsetX: number, width: number, count: number): number | null {
  if (count === 0 || width === 0) {
    return null;
  }
  return Math.min(count - 1, Math.max(0, Math.floor((offsetX / width) * count)));
}

/** « 12 photos », ou « 12 photos, dont 3 sans couleurs encore » ; vide tant que rien n'est lu. */
export function stripSummary(view: MediaPaletteStripView | null): string {
  if (view === null) {
    return '';
  }
  const { total, unpainted } = view;
  const photos = `${String(total)} photo${total > 1 ? 's' : ''}`;
  return unpainted === 0 ? photos : `${photos}, dont ${String(unpainted)} sans couleurs encore`;
}

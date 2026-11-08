import { type ColumnWidthStep, columnWidthStepOf, twelfthsOf } from '@lfd/mail-blocks';

/** Une ligne fait douze douzièmes ; une colonne en garde au moins deux. */
const ROW_TWELFTHS = 12;
const MIN_COLUMN_TWELFTHS = 2;

/** Les bornes d'une frontière, en douzièmes depuis le bord gauche de la ligne. */
export interface BoundaryRange {
  readonly min: number;
  readonly max: number;
}

/** La position de chaque frontière, en douzièmes depuis le bord gauche (une de moins que de colonnes). */
export function boundaryPositions(widths: readonly ColumnWidthStep[]): readonly number[] {
  const positions: number[] = [];
  let sum = 0;
  for (const step of widths.slice(0, -1)) {
    sum += twelfthsOf(step);
    positions.push(sum);
  }
  return positions;
}

/** Où la frontière peut aller : ses deux colonnes voisines gardent chacune au moins 2/12. */
export function boundaryRange(widths: readonly ColumnWidthStep[], boundary: number): BoundaryRange {
  const left = widths[boundary];
  const right = widths[boundary + 1];
  if (left === undefined || right === undefined) {
    return { min: 0, max: 0 };
  }
  const start = widths.slice(0, boundary).reduce((sum, step) => sum + twelfthsOf(step), 0);
  return {
    min: start + MIN_COLUMN_TWELFTHS,
    max: start + twelfthsOf(left) + twelfthsOf(right) - MIN_COLUMN_TWELFTHS,
  };
}

/**
 * Pose la frontière `boundary` à `position` douzièmes : seules ses deux
 * colonnes voisines changent, leur somme est gardée, la position est bornée.
 * Rend le tableau d'origine quand rien ne bouge.
 */
export function placeBoundary(
  widths: readonly ColumnWidthStep[],
  boundary: number,
  position: number,
): readonly ColumnWidthStep[] {
  const left = widths[boundary];
  const right = widths[boundary + 1];
  if (left === undefined || right === undefined || !Number.isFinite(position)) {
    return widths;
  }
  const range = boundaryRange(widths, boundary);
  const clamped = Math.min(range.max, Math.max(range.min, Math.round(position)));
  const current = boundaryPositions(widths)[boundary] ?? clamped;
  const delta = clamped - current;
  if (delta === 0) {
    return widths;
  }
  const nextLeft = columnWidthStepOf(twelfthsOf(left) + delta);
  const nextRight = columnWidthStepOf(twelfthsOf(right) - delta);
  if (nextLeft === null || nextRight === null) {
    return widths;
  }
  return widths.map((step, index) =>
    index === boundary ? nextLeft : index === boundary + 1 ? nextRight : step,
  );
}

/** Déplace la frontière de `delta` douzièmes (flèches du clavier). */
export function moveBoundary(
  widths: readonly ColumnWidthStep[],
  boundary: number,
  delta: number,
): readonly ColumnWidthStep[] {
  const current = boundaryPositions(widths)[boundary];
  return current === undefined ? widths : placeBoundary(widths, boundary, current + delta);
}

/**
 * La frontière là où tombe le pointeur : `fraction` est sa place sur la
 * largeur de la ligne (0 à gauche, 1 à droite), aimantée au douzième.
 */
export function boundaryAtFraction(
  widths: readonly ColumnWidthStep[],
  boundary: number,
  fraction: number,
): readonly ColumnWidthStep[] {
  return placeBoundary(widths, boundary, fraction * ROW_TWELFTHS);
}

/** Des colonnes égales (6/6, 4/4/4) ; `null` si le nombre de colonnes ne partage pas la ligne en crans. */
export function equalWidths(count: number): readonly ColumnWidthStep[] | null {
  if (count < 1 || ROW_TWELFTHS % count !== 0) {
    return null;
  }
  const step = columnWidthStepOf(ROW_TWELFTHS / count);
  return step === null ? null : Array.from({ length: count }, () => step);
}

/** Une position en douzièmes, dite en pour cent de la ligne. */
export function twelfthsPercent(twelfths: number): number {
  return Math.round((twelfths / ROW_TWELFTHS) * 100);
}

/** La répartition dite au lecteur d'écran : « colonne 1 à 58 %, colonne 2 à 42 % ». */
export function widthsSpoken(widths: readonly ColumnWidthStep[]): string {
  return widths.map((step, index) => `colonne ${index + 1} à ${step} %`).join(', ');
}

/** Deux répartitions identiques ? */
export function sameWidths(
  left: readonly ColumnWidthStep[],
  right: readonly ColumnWidthStep[],
): boolean {
  return left.length === right.length && left.every((step, index) => step === right[index]);
}

/**
 * La gouttière entre deux colonnes, en CSS : la même que l'e-mail (12 px,
 * `COLUMN_GUTTER_PX` de `@lfd/mailer`), portée par le `gap` de la ligne et
 * jamais par une colonne — sans quoi la colonne de gauche serait plus étroite
 * que sa voisine de même cran (« deux photos en 50/50 n'ont pas la même
 * hauteur », 2026-11-08).
 */
export const COLUMN_GUTTER_CSS = 'var(--fold-space-md)';

/**
 * Une position sur la ligne, en CSS : `twelfths` douzièmes de la place utile
 * (la ligne moins ses gouttières), plus `gutters` gouttières — `0.5` pour le
 * milieu d'une gouttière.
 */
export function rowOffsetCss(count: number, twelfths: number, gutters: number): string {
  const usable = `(100% - ${Math.max(0, count - 1)} * ${COLUMN_GUTTER_CSS})`;
  return `calc(${usable} * ${twelfths} / ${ROW_TWELFTHS} + ${gutters} * ${COLUMN_GUTTER_CSS})`;
}

/** La largeur d'une colonne de `twelfths` douzièmes, en CSS. */
export function columnSpanCss(count: number, twelfths: number): string {
  return rowOffsetCss(count, twelfths, 0);
}

/**
 * La place du pointeur sur la PLACE UTILE (0 à 1), pour la frontière
 * `boundary` : on retire les gouttières à sa gauche et la moitié de la sienne,
 * l'inverse exact de `rowOffsetCss(count, position, boundary + 0.5)`.
 */
export function usableFraction(
  offsetPx: number,
  rowPx: number,
  count: number,
  boundary: number,
  gutterPx: number,
): number {
  const usable = rowPx - Math.max(0, count - 1) * gutterPx;
  return usable <= 0 ? 0 : (offsetPx - (boundary + 0.5) * gutterPx) / usable;
}

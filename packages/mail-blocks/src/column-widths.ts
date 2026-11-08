/**
 * **Les crans de largeur d'une colonne**, en pour cent tels que l'écran les
 * affiche : un cran par DOUZIÈME de la ligne, de 2/12 à 10/12 (élargi le
 * 2026-11-08 pour la poignée qu'on tire entre deux colonnes — Hugo ; avant :
 * 25, 33, 50, 67, 75 seulement, toujours admis).
 *
 * La somme se compte en douzièmes, où chaque cran tombe juste — en pour cent
 * arrondis, 33 + 33 + 33 ferait 99 et 17 + 17 + 67 ferait 101.
 */
export const COLUMN_WIDTH_STEPS = [17, 25, 33, 42, 50, 58, 67, 75, 83] as const;

/** Un cran de largeur. */
export type ColumnWidthStep = (typeof COLUMN_WIDTH_STEPS)[number];

const TWELFTHS: Readonly<Record<ColumnWidthStep, number>> = {
  17: 2,
  25: 3,
  33: 4,
  42: 5,
  50: 6,
  58: 7,
  67: 8,
  75: 9,
  83: 10,
};

const FULL_ROW_TWELFTHS = 12;

/** Un nombre est-il un cran admis ? */
export function isColumnWidthStep(candidate: number): candidate is ColumnWidthStep {
  return COLUMN_WIDTH_STEPS.some((step) => step === candidate);
}

/** Des crans qui font une ligne pleine (100 %). */
export function widthsFillTheRow(widths: readonly ColumnWidthStep[]): boolean {
  return widths.reduce((sum, step) => sum + TWELFTHS[step], 0) === FULL_ROW_TWELFTHS;
}

/** Le nombre de douzièmes d'un cran. */
export function twelfthsOf(step: ColumnWidthStep): number {
  return TWELFTHS[step];
}

/** Le cran d'un nombre de douzièmes, ou `null` hors de 2 à 10. */
export function columnWidthStepOf(twelfths: number): ColumnWidthStep | null {
  return COLUMN_WIDTH_STEPS.find((step) => TWELFTHS[step] === twelfths) ?? null;
}

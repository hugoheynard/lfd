/**
 * **Les crans de largeur d'une colonne**, en pour cent tels que l'écran les
 * affiche (plan `plan-editeur-par-blocs.md`, § 2 : 25, 33, 50, 67, 75).
 *
 * 33 et 67 sont des TIERS : trois colonnes à 33 % font une ligne pleine. La
 * somme se compte donc en douzièmes, où chaque cran tombe juste — en pour
 * cent, 33 + 33 + 33 ferait 99 et aucune ligne de trois colonnes égales ne
 * serait admise.
 */
export const COLUMN_WIDTH_STEPS = [25, 33, 50, 67, 75] as const;

/** Un cran de largeur. */
export type ColumnWidthStep = (typeof COLUMN_WIDTH_STEPS)[number];

const TWELFTHS: Readonly<Record<ColumnWidthStep, number>> = {
  25: 3,
  33: 4,
  50: 6,
  67: 8,
  75: 9,
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

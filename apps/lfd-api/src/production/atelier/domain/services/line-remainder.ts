/**
 * **Le reste à sortir d'une ligne, sous son plafond** (
 * `documentation/fournil/les-niveaux-de-suivi.md`) :
 * `min(compte, plafond) − sorti`, jamais négatif.
 *
 * Le plafond est le sorti déclaré au dernier rouge de la ligne ; il survit au
 * « traité ». `null` : la ligne n'a jamais eu de rouge.
 */
export function remainderUnderCeiling(
  counted: number,
  ceiling: number | null,
  output: number,
): number {
  const target = ceiling === null ? counted : Math.min(counted, ceiling);
  return Math.max(0, target - output);
}

import { ProblemOutputAboveCountError } from "../errors/problem-errors.js";

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

/**
 * **La borne haute d'un rouge** : le compte du jour, ou ce qui est déjà
 * déclaré s'il le dépasse. Au-delà, c'est presque toujours une faute de
 * frappe (10 000 pour 100), qui déclarerait un surplus remis au colisage ; un
 * vrai surplus se déclare par une fournée, comme avant.
 *
 * @throws {ProblemOutputAboveCountError} le sorti dépasse la borne.
 */
export function assertProblemWithinBound(produced: number, counted: number, output: number): void {
  const bound = Math.max(counted, output);
  if (produced > bound) {
    throw new ProblemOutputAboveCountError(produced, bound);
  }
}

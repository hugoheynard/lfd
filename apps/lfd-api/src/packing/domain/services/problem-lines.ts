import { PresentBeyondDueError } from "../errors/packing-problem-errors.js";
import { PackingLineNotFoundError } from "../errors/packing-station-errors.js";
import type { SheetLine } from "../entities/packing-sheet.snapshot.js";

/** Ce que « Problème » dit d'un article : combien est vraiment là. */
export interface PresentQuantity {
  readonly sku: string;
  readonly present: number;
}

/** Une ligne due et ce qui en est vraiment là. */
export interface PresentLine {
  readonly line: SheetLine;
  readonly present: number;
}

/**
 * **Ce que « Problème » dit, ligne par ligne** (plan des niveaux de suivi du
 * colisage, D5), dans l'ordre des SKU — celui des verrous de la réserve.
 *
 * Un article que le poste ne cite pas est entièrement là : on nomme ce qui
 * pose problème, pas ce qui va bien.
 *
 * @throws {PackingLineNotFoundError} un SKU cité n'est pas sur le bon.
 * @throws {PresentBeyondDueError} plus de présents que de commandés.
 */
export function presentLinesOf(
  reference: string,
  lines: readonly SheetLine[],
  said: readonly PresentQuantity[],
): readonly PresentLine[] {
  for (const { sku } of said) {
    if (!lines.some((line) => line.sku === sku)) {
      throw new PackingLineNotFoundError(sku, reference);
    }
  }
  return [...lines]
    .sort((a, b) => a.sku.localeCompare(b.sku))
    .map((line) => {
      const present = said.find((entry) => entry.sku === line.sku)?.present ?? line.quantity;
      if (present > line.quantity) {
        throw new PresentBeyondDueError(line.productName, line.quantity, present, line.saleUnit);
      }
      return { line, present };
    });
}

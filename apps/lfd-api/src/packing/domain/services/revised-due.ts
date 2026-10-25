import type { SheetLine } from "../entities/packing-sheet.snapshot.js";
import {
  RevisedDueBelowPackedError,
  RevisedDueMismatchError,
} from "../errors/packing-revision-errors.js";

/** La quantité due révisée d'un article. */
export interface DueRevision {
  readonly sku: string;
  readonly quantity: number;
}

/** Une ligne due qui a changé : de → à, nommée comme la feuille la nomme. */
export interface RevisedDueLine {
  readonly sku: string;
  readonly productName: string;
  readonly from: number;
  readonly to: number;
}

/**
 * **Les lignes dues d'une feuille, révisées** (plan A2, § 7) — pur. Mêmes
 * articles que la feuille, quantités entières ≥ 1 ; aucune ne descend sous
 * ce qui est déjà au bac (S1 : l'excédent n'aurait pas de contenant désigné).
 * La marque « au bac » de chaque ligne est l'affaire de l'agrégat.
 *
 * @returns les lignes révisées (même ordre) et celles qui ont changé.
 * @throws {RevisedDueMismatchError} @throws {RevisedDueBelowPackedError}
 */
export function revisedDueOf(
  reference: string,
  lines: readonly SheetLine[],
  revisions: readonly DueRevision[],
  allocatedOf: (sku: string) => number,
): { readonly lines: readonly SheetLine[]; readonly changed: readonly RevisedDueLine[] } {
  const due = new Map(revisions.map((revision) => [revision.sku, revision.quantity]));
  const sameArticles =
    due.size === revisions.length &&
    due.size === lines.length &&
    lines.every((line) => due.has(line.sku));
  const valid = revisions.every((r) => Number.isInteger(r.quantity) && r.quantity >= 1);
  if (!sameArticles || !valid) {
    throw new RevisedDueMismatchError(reference);
  }
  const changed: RevisedDueLine[] = [];
  const revised = lines.map((line) => {
    const to = due.get(line.sku) ?? line.quantity;
    const packed = allocatedOf(line.sku);
    if (to < packed) {
      throw new RevisedDueBelowPackedError(reference, line.productName, packed, to);
    }
    if (to !== line.quantity) {
      changed.push({ sku: line.sku, productName: line.productName, from: line.quantity, to });
    }
    return { ...line, quantity: to };
  });
  return { lines: revised, changed };
}

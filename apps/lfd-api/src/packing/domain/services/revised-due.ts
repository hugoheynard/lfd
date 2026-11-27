import type { SheetLine, SheetLineOption } from "../entities/packing-sheet.snapshot.js";
import {
  RevisedDueBelowPackedError,
  RevisedDueMismatchError,
} from "../errors/packing-revision-errors.js";

/** La quantité due révisée d'un article. */
export interface DueRevision {
  readonly sku: string;
  readonly quantity: number;
  /**
   * Les options révisées (`plan-options-de-commande.md`, § 4) ; `[]` = aucune.
   * Absent : la révision n'en dit rien, la ligne garde les siennes.
   */
  readonly options?: readonly SheetLineOption[];
}

/** Ce que la révision a changé : les quantités dues, et si une option a bougé. */
export interface RevisedDue {
  readonly changed: readonly RevisedDueLine[];
  /** Au moins une ligne a changé d'options — la feuille s'écrit, aucun compte ne bouge. */
  readonly optionsChanged: boolean;
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
 * Les options d'une ligne sont remplacées par celles de la révision ; elles
 * ne touchent ni la clé ni ce qui est au bac.
 *
 * @returns les lignes révisées (même ordre), celles dont la quantité a changé,
 *   et si une option a bougé.
 * @throws {RevisedDueMismatchError} @throws {RevisedDueBelowPackedError}
 */
export function revisedDueOf(
  reference: string,
  lines: readonly SheetLine[],
  revisions: readonly DueRevision[],
  allocatedOf: (sku: string) => number,
): RevisedDue & { readonly lines: readonly SheetLine[] } {
  const due = new Map(revisions.map((revision) => [revision.sku, revision.quantity]));
  const options = new Map(revisions.map((revision) => [revision.sku, revision.options]));
  const sameArticles =
    due.size === revisions.length &&
    due.size === lines.length &&
    lines.every((line) => due.has(line.sku));
  const valid = revisions.every((r) => Number.isInteger(r.quantity) && r.quantity >= 1);
  if (!sameArticles || !valid) {
    throw new RevisedDueMismatchError(reference);
  }
  const changed: RevisedDueLine[] = [];
  let optionsChanged = false;
  const revised = lines.map((line) => {
    const to = due.get(line.sku) ?? line.quantity;
    const packed = allocatedOf(line.sku);
    if (to < packed) {
      throw new RevisedDueBelowPackedError(reference, line.productName, packed, to);
    }
    if (to !== line.quantity) {
      changed.push({ sku: line.sku, productName: line.productName, from: line.quantity, to });
    }
    const revisedOptions = options.get(line.sku);
    if (revisedOptions === undefined) {
      return { ...line, quantity: to };
    }
    optionsChanged ||= !sameOptions(line.options ?? [], revisedOptions);
    return { ...line, quantity: to, options: revisedOptions.map((option) => ({ ...option })) };
  });
  return { lines: revised, changed, optionsChanged };
}

function sameOptions(a: readonly SheetLineOption[], b: readonly SheetLineOption[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (option, i) =>
        option.groupName === b[i]?.groupName &&
        option.choiceLabel === b[i]?.choiceLabel &&
        option.quantity === b[i]?.quantity,
    )
  );
}

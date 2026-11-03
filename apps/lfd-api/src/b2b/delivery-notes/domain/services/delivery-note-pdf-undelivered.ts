import { type Doc, LEFT, MM, put, REGULAR, WIDTH } from "../../../../platform/pdf/paper-pdf-kit.js";
import { saleQuantityText } from "../../../orders/domain/services/order-sheet-pdf-format.js";
import type { UndeliveredLine } from "./undelivered-lines.js";

/**
 * **« Non livré : … » sous le tableau du BL** (Hugo, 2026-11-03) : le papier
 * n'imprime que les lignes remises, et dit en une phrase ce qui ne l'est pas.
 * Les grammes d'un article au poids s'écrivent comme dans le tableau.
 */

const SIZE = 10;
const GAP = 3 * MM;

/** « Non livré : 3 × Gros florentin lait, 250 g × Brioche. » — `null` sans manque. */
export function undeliveredSentence(lines: readonly UndeliveredLine[]): string | null {
  if (lines.length === 0) {
    return null;
  }
  const items = lines.map(
    (line) => `${saleQuantityText(line.quantity, line.saleUnit)} × ${line.productName}`,
  );
  return `Non livré : ${items.join(", ")}.`;
}

/** La hauteur que la mention prendra, pour que le tableau la garde sur sa page. */
export function undeliveredSpace(doc: Doc, lines: readonly UndeliveredLine[]): number {
  const sentence = undeliveredSentence(lines);
  if (sentence === null) {
    return 0;
  }
  return GAP + doc.font(REGULAR).fontSize(SIZE).heightOfString(sentence, { width: WIDTH });
}

/** La mention, sous le tableau ; rend l'ordonnée sous elle (inchangée sans manque). */
export function undeliveredMention(
  doc: Doc,
  lines: readonly UndeliveredLine[],
  top: number,
): number {
  const sentence = undeliveredSentence(lines);
  if (sentence === null) {
    return top;
  }
  put(doc, sentence, LEFT, top + GAP, { size: SIZE, width: WIDTH });
  return doc.y;
}
